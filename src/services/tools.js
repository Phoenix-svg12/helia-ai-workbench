/**
 * 工具服务 —— 为智能体和工作流提供真实工具能力。
 *
 * 重构说明（P1-2）：
 *   - 实现 web_search：接 Tavily/Serper API（需用户在设置填 key），无 key 时降级占位
 *   - 实现 code_exec：浏览器端 JS 沙箱执行
 *   - 实现 knowledge：接知识库 store 的 RAG 检索
 *   - 统一 callTool(toolId, input, opts) 接口
 *
 * 工具注册表：每个工具 { id, label, call(input, opts) => Promise<string> }
 */

import { useKnowledgeStore } from '@/stores/knowledge'
import { useSettingsStore } from '@/stores/settings'

// 工具注册表
const TOOLS = {
  /**
   * 网页搜索：接 Tavily API（用户需在设置页填 searchApiKey）
   * 无 key 时降级为占位提示
   */
  web_search: {
    label: '网页搜索',
    async call(input, opts = {}) {
      const settings = useSettingsStore()
      const apiKey = settings.searchApiKey
      if (!apiKey) {
        return `⚠️ [网页搜索 · 未配置 API Key]\n搜索词：${input}\n\n提示：到「设置 → AI 服务」填写搜索 API Key（Tavily）后可启用真实联网搜索。当前为占位输出，无法获取实时信息。`
      }
      try {
        const resp = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: input.slice(0, 200),
            max_results: 5,
            include_answer: true
          }),
          signal: opts.signal
        })
        if (!resp.ok) throw new Error(`搜索 API ${resp.status}`)
        const data = await resp.json()
        const answer = data.answer || ''
        const results = (data.results || []).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.url}\n${(r.content || '').slice(0, 200)}`
        ).join('\n\n')
        return `搜索词：${input}\n\nAI 摘要：${answer}\n\n来源：\n${results}`
      } catch (e) {
        if (e?.name === 'AbortError') throw e
        return `[网页搜索失败] ${e.message}\n搜索词：${input}`
      }
    }
  },

  /**
   * 代码执行：浏览器端 JS 沙箱
   * 用 new Function 隔离作用域，捕获 console.log 输出
   */
  code_exec: {
    label: '代码执行',
    async call(input, opts = {}) {
      // 从输入中提取代码块（```包裹 或 整段）
      const codeMatch = input.match(/```(?:javascript|js|python)?\n?([\s\S]*?)```/)
      const code = codeMatch ? codeMatch[1].trim() : input.trim()
      if (!code) return '[代码执行] 未检测到代码内容'

      const logs = []
      const fakeConsole = {
        log: (...args) => logs.push(args.map(formatArg).join(' ')),
        error: (...args) => logs.push('[ERROR] ' + args.map(formatArg).join(' ')),
        warn: (...args) => logs.push('[WARN] ' + args.map(formatArg).join(' '))
      }
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('console', `"use strict";\n${code}`)
        const result = fn(fakeConsole)
        let output = ''
        if (logs.length) output += logs.join('\n') + '\n'
        if (result !== undefined) output += `=> ${formatArg(result)}`
        return `[代码执行结果]\n${output || '(无输出)'}`
      } catch (e) {
        return `[代码执行失败] ${e.name}: ${e.message}`
      }
    }
  },

  /**
   * 知识库检索：接 knowledge store 的 RAG
   */
  knowledge: {
    label: '知识库检索',
    async call(input, opts = {}) {
      const knowledge = useKnowledgeStore()
      if (!knowledge.documents.length) {
        return `[知识库检索] 暂无文档，请先到「知识库」页面上传`
      }
      const context = knowledge.buildContext(input, 3)
      if (!context) {
        return `[知识库检索] 未找到与「${input.slice(0, 30)}」相关的内容`
      }
      return `[知识库检索结果]\n${context}`
    }
  },

  /**
   * 图像生成：占位
   */
  image_gen: {
    label: '图像生成',
    async call(input) {
      return `[图像生成 · 占位] 描述：${input}\n提示：图像生成能力需接入 DALL-E / Stable Diffusion API。`
    }
  }
}

function formatArg(v) {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

/**
 * 统一工具调用入口
 * @param {string} toolId  工具 ID（web_search / code_exec / knowledge / image_gen）
 * @param {string} input   输入文本
 * @param {Object} opts    { signal } 可选
 * @returns {Promise<string>} 工具输出
 */
export async function callTool(toolId, input, opts = {}) {
  const tool = TOOLS[toolId]
  if (!tool) {
    return `[未知工具：${toolId}]\n${input}`
  }
  return tool.call(input, opts)
}

/**
 * 列出所有工具（供 UI 展示）
 */
export function listTools() {
  return Object.entries(TOOLS).map(([id, t]) => ({ id, label: t.label }))
}

export { TOOLS }
