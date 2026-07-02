/**
 * AI 服务封装 —— OpenAI 兼容的 chat completions 流式调用 + 本地 fallback。
 *
 * 主要导出：
 *   streamChat(opts)        真实流式调用（SSE 解析），返回异步迭代器
 *   chatOnce(opts)          非流式一次性调用
 *   testConnection(cfg)     测试连通性
 *   localFallback(messages) 无 key 时的本地多样化回复引擎
 *
 * opts:
 *   baseUrl, apiKey, model, messages, temperature, signal, onDelta
 */
import { useSettingsStore } from '@/stores/settings'

// ============ 真实 API 调用 ============

/**
 * 流式 chat completions。OpenAI 兼容格式（DeepSeek/智谱/通义/Moonshot/Ollama 均兼容）。
 * @param {Object} opts
 *   - messages: [{role, content}, ...]
 *   - model: 真实模型 ID（如 deepseek-chat）
 *   - temperature: 0-1
 *   - signal: AbortSignal（用于取消）
 *   - onDelta: (textChunk) => void  每收到一段文本回调
 * @returns {Promise<string>} 完整回复文本
 */
export async function streamChat(opts) {
  const { baseUrl, apiKey, model, messages, temperature = 0.6, signal, onDelta } = opts
  if (!baseUrl) throw new Error('未配置 Base URL，请到「设置 → AI 服务」配置')
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true
    }),
    signal
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${errText.slice(0, 300) || resp.statusText}`)
  }

  if (!resp.body) throw new Error('响应无 body，不支持流式')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let full = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE 事件以 \n\n 分隔
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        const lines = part.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') return full
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content || ''
            if (delta) {
              full += delta
              onDelta?.(delta)
            }
          } catch {
            // 单行解析失败时跳过（可能是注释或心跳）
          }
        }
      }
    }
    return full
  } finally {
    // 确保释放 reader，避免连接泄漏
    reader.cancel().catch(() => {})
  }
}

/**
 * 非流式一次性调用。用于工作流节点执行（需要完整结果再传给下一节点）。
 */
export async function chatOnce(opts) {
  const { baseUrl, apiKey, model, messages, temperature = 0.6, signal } = opts
  if (!baseUrl) throw new Error('未配置 Base URL，请到「设置 → AI 服务」配置')
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({ model, messages, temperature, stream: false }),
    signal
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${errText.slice(0, 300) || resp.statusText}`)
  }
  const json = await resp.json()
  return json.choices?.[0]?.message?.content || ''
}

/**
 * 测试连通性。发一个极小的 chat 请求，看能否拿到回复。
 */
export async function testConnection(cfg) {
  try {
    const text = await chatOnce({
      ...cfg,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0
    })
    return { ok: true, sample: text.slice(0, 60) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 从 Provider 的 /models 端点获取可用模型列表。
 * OpenAI 兼容格式（DeepSeek/智谱/通义/Moonshot/Ollama 均支持）。
 * @param {string} baseUrl
 * @param {string} apiKey
 * @returns {Promise<string[]>} 模型 ID 列表
 */
export async function fetchModels(baseUrl, apiKey) {
  const url = baseUrl.replace(/\/$/, '') + '/models'
  const headers = {}
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey
  }
  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${errText.slice(0, 200) || resp.statusText}`)
  }
  const json = await resp.json()
  // OpenAI 格式: { data: [{ id: "model-name" }, ...] }
  // Ollama 格式: { models: [{ name: "model-name" }, ...] }
  if (json.data && Array.isArray(json.data)) {
    return json.data.map(m => m.id).filter(Boolean)
  }
  if (json.models && Array.isArray(json.models)) {
    return json.models.map(m => m.name || m.id).filter(Boolean)
  }
  return []
}

// ============ 本地 fallback 回复引擎 ============
// 当用户未配置 API key 时使用：基于关键词意图识别 + 多模板池，
// 让对话不再是"永远回同一段话"的空壳。接入 API 后自动停用。

const INTENTS = [
  { id: 'summarize', keywords: ['总结', '摘要', '概括', '提炼', 'summarize', '要点', '梳理'], weight: 2 },
  { id: 'translate', keywords: ['翻译', 'translate', '日语', '英语', '中文', '敬语', '改写'], weight: 2 },
  { id: 'code',      keywords: ['代码', 'code', '函数', 'bug', 'diff', 'python', 'javascript', 'java', '重构', 'review'], weight: 2 },
  { id: 'table',     keywords: ['表格', 'table', '对比', '矩阵', '清单', '列表'], weight: 1.5 },
  { id: 'plan',      keywords: ['计划', '规划', '路线', 'schedule', '排期', '优先级', '任务'], weight: 1.5 },
  { id: 'qa',        keywords: ['什么是', '为什么', '如何', '怎么', '？', '?', '区别', '原理'], weight: 1 },
  { id: 'write',     keywords: ['写', '起草', '撰写', '邮件', '报告', '文档', 'PRD'], weight: 1.5 }
]

const TEMPLATES = {
  summarize: [
    (q) => `好的，我来帮你梳理「${q.slice(0, 24)}」。从结构上看，可以归纳为 3 个层次：\n\n**核心结论**\n• 主线 A：围绕目标的关键路径\n• 主线 B：支撑性细节与证据\n• 主线 C：潜在风险与待验证项\n\n**证据强度**：高 / 中 / 低 各占约 40% / 40% / 20%。\n\n需要我把它转成表格或时间线吗？`,
    (q) => `已读取内容。按"问题—影响—机会"三栏整理：\n\n| 问题 | 影响 | 机会 |\n| --- | --- | --- |\n| 信息密度不均 | 阅读成本高 | 提炼要点上墙 |\n| 缺少优先级 | 决策困难 | 加权评分 |\n| 无追踪 | 容易遗漏 | 转任务 |\n\n如果要进一步压缩成一句话，我建议：**${q.slice(0, 16)}的核心是"用最小信息单位承载最大决策价值"。**`
  ],
  translate: [
    (q) => `已改写完成（商务日语版）：\n\n拝啓\n貴社におかれましては益々ご清栄のこととお慶び申し上げます。\n${q.slice(0, 30)}につきまして、ご相談させていただきたく存じます。\n\n敬語注解：\n• 「ご清栄」— 相手の繁栄を祝う定形表現\n• 「存じます」— 「思います」の謙譲語\n\n需要英文版或更随意的语气吗？`,
    (q) => `改写为英文：\n\n> ${q.slice(0, 40)}\n\n保留原意，调整为商务正式风格。如需更口语化或学术化版本，告诉我目标场景。`
  ],
  code: [
    (q) => `看了一下你提到的「${q.slice(0, 20)}」。给出按行注释与建议：\n\n\`\`\`diff\n- // 旧逻辑：直接遍历，O(n²)\n+ // 建议：用 Map 索引，降到 O(n)\n\`\`\`\n\n**风险评分**：中\n• 可读性：6/10\n• 性能：4/10\n• 边界覆盖：7/10\n\n要我把完整重构版写出来吗？`,
    (q) => `根据描述，这是实现思路：\n\n1. 入口函数校验输入，提前 return 非法值\n2. 主流程用 try/catch 包裹，异常写日志\n3. 关键状态用 \`ref\` / \`computed\` 派生，避免重复计算\n\n\`\`\`python\ndef solve(input):\n    if not input:\n        return None\n    return process(input)\n\`\`\`\n\n需要补单元测试吗？`
  ],
  table: [
    (q) => `已生成对比表格：\n\n| 维度 | 方案 A | 方案 B | 方案 C |\n| --- | --- | --- | --- |\n| 成本 | 低 | 中 | 高 |\n| 速度 | 快 | 中 | 慢 |\n| 扩展性 | 一般 | 好 | 极好 |\n| 推荐场景 | 原型 | 生产 | 长期 |\n\n针对「${q.slice(0, 16)}」，综合评分 A=7、B=8、C=8.5，建议 C。`
  ],
  plan: [
    (q) => `围绕「${q.slice(0, 20)}」拆成 3 个 sprint：\n\n**Sprint 1（2 周）**\n• 需求冻结 + 原型验证\n• 关键路径打通\n\n**Sprint 2（2 周）**\n• 核心功能开发\n• 单元测试覆盖 80%\n\n**Sprint 3（1 周）**\n• 联调 + 性能优化\n• 灰度发布\n\n风险点：依赖方排期未定，建议本周内确认。`
  ],
  qa: [
    (q) => `关于「${q.slice(0, 24)}」，简要回答：\n\n**核心原理**：把输入映射到目标空间，中间通过若干变换层保留语义。\n\n**关键区别**：\n• 短期：依赖外部上下文\n• 长期：内化到参数\n\n**实际影响**：在长文本场景下，前者更稳定但更慢，后者更快但有遗忘风险。\n\n如果需要更深入的技术细节，告诉我你的背景，我调整深度。`
  ],
  write: [
    (q) => `已起草初稿（约 200 字）：\n\n关于${q.slice(0, 20)}，本次沟通主要达成以下共识：\n\n1. 目标：在 Q3 内完成核心能力建设\n2. 范围：聚焦三个优先级最高的场景\n3. 里程碑：每月一次同步，双周一次站会\n\n如需调整语气（正式/轻松）或补充数据，告诉我。`
  ],
  default: [
    (q) => `收到「${q.slice(0, 24)}」。我可以从这几个角度帮你：\n\n1. 拆解任务并给出执行步骤\n2. 生成对应的内容（文档/代码/表格）\n3. 对比方案并给推荐\n\n你希望先从哪一项开始？或者把具体要求说详细一点，我直接产出结果。`,
    (q) => `明白你的需求。基于「${q.slice(0, 20)}」，我的建议是：\n\n• 先明确成功标准（可衡量的）\n• 再倒推最小可行路径\n• 最后列出风险与缓解措施\n\n要我把这个框架填上你的具体内容吗？`,
    (q) => `好的。这件事的关键在于"区分必要的与可选的"。我建议：\n\n1. 列出所有子任务\n2. 标注必要/可选\n3. 必要项排期，可选项放 backlog\n\n这样能在有限时间内拿到最大价值。需要我帮你列清单吗？`
  ]
}

function pickIntent(question) {
  const q = question.toLowerCase()
  let best = { id: 'default', score: 0 }
  for (const intent of INTENTS) {
    let score = 0
    for (const kw of intent.keywords) {
      if (q.includes(kw.toLowerCase())) score += intent.weight
    }
    if (score > best.score) best = { id: intent.id, score }
  }
  return best.id
}

function pickTemplate(intent) {
  const pool = TEMPLATES[intent] || TEMPLATES.default
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 本地 fallback：根据用户消息选模板生成回复。
 * @param {Array} messages 完整对话历史 [{role, content}]
 * @returns {string} 回复文本
 */
export function localFallback(messages) {
  const last = [...messages].reverse().find(m => m.role === 'user')
  const q = last?.content || ''
  const intent = pickIntent(q)
  const tpl = pickTemplate(intent)
  return tpl(q)
}

// ============ 统一入口：根据配置自动选择真实 API 或 fallback ============

/**
 * 统一聊天入口。已配置 API key 则走真实流式，否则走本地 fallback（模拟流式）。
 *
 * @param {Object} opts
 *   - messages: [{role, content}]
 *   - model: Helia 模型名（如 Helia-Pro），内部映射到真实模型 ID
 *   - temperature
 *   - systemPrompt: 可选，覆盖默认 system
 *   - signal: AbortSignal
 *   - onDelta: (chunk) => void
 * @returns {Promise<string>}
 */
export async function chat(opts) {
  const settings = useSettingsStore()
  const { messages, model, temperature, systemPrompt, signal, onDelta } = opts

  // 未配置 → 本地 fallback（模拟流式输出）
  if (!settings.isConfigured) {
    const text = localFallback(messages)
    const note = '\n\n---\n⚠️ **当前为本地演示模式**（未配置 API Key），以上为模拟回复，无法执行真实任务（如查询天气、搜索资讯等）。\n\n请到「**设置 → AI 服务**」配置 API Key 后启用真实 AI 对话。'
    const fullText = text + note
    // 模拟流式：按字符 chunk 输出
    const chunks = fullText.match(/[\s\S]{1,3}/g) || []
    for (const c of chunks) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onDelta?.(c)
      await new Promise(r => setTimeout(r, 18 + Math.random() * 22))
    }
    return fullText
  }

  // 已配置 → 真实流式 API
  const realModel = settings.realModel(model)
  const fullMessages = [
    { role: 'system', content: systemPrompt || settings.defaultSystem },
    ...messages
  ]
  return streamChat({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: realModel,
    messages: fullMessages,
    temperature,
    signal,
    onDelta
  })
}
