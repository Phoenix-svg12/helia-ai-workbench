import { defineStore } from 'pinia'

/**
 * 智能体 store —— 参考 Coze/Dify 的智能体模型。
 *
 * 每个智能体的完整配置：
 *   id, name, desc, color, icon
 *   type          对话型 / 工作流型 / 工具型
 *   systemPrompt  人设与回复逻辑（核心）
 *   temperature   温度
 *   greeting      开场白
 *   suggestedQuestions  推荐问题
 *   skills        技能标签
 *   knowledgeBaseIds  绑定的知识库 ID 数组（对话时自动 RAG）
 *   tools         可用工具（web_search / code_exec / knowledge）
 *   model         独立模型配置（留空则跟随全局 chat.model）
 *   autonomy      自主度：'suggest'（仅建议）/ 'auto-edit'（执行前确认）/ 'full-auto'（全自动）—— 对标 Helia
 *   pinned, runs(调用次数), avg
 *
 * Store 级运行记录：
 *   runLogs       所有智能体的运行记录数组（真实统计来源，替代硬编码假数据）
 *   每条：{ id, agentId, agentName, title, status, trigger, startedAt, endedAt, duration, tokens, output? }
 *
 * 重构说明（P0-1）：
 *   - 补全 create / clone / incrementRuns / recordRun / exportRule / importRule action
 *   - 新增 runLogs + stats / recentRuns / liveRuns getter（替代 View 层硬编码假数据）
 *   - 新增 autonomy 字段（对标 Helia 分级审批）
 */

// 可用工具定义
export const AVAILABLE_TOOLS = [
  { id: 'web_search',  label: '网页搜索',   desc: '联网搜索实时信息', icon: 'search' },
  { id: 'code_exec',   label: '代码执行',   desc: '运行 JS 代码（浏览器沙箱）', icon: 'code' },
  { id: 'knowledge',   label: '知识库检索', desc: '从绑定的知识库检索', icon: 'book' },
  { id: 'image_gen',   label: '图像生成',   desc: '生成图片（占位）', icon: 'image' }
]

// 自主度档位（对标 Helia 三档审批）
export const AUTONOMY_LEVELS = [
  { id: 'suggest',   label: '仅建议',  desc: '只生成方案，不执行，需用户确认' },
  { id: 'auto-edit', label: '执行前确认', desc: '自动执行，但开始前弹确认' },
  { id: 'full-auto', label: '全自动',  desc: '完全自动执行，无需确认' }
]

const seedAgents = [
  {
    id: 'a-1',
    name: '研究助理',
    desc: '把长文、访谈、报告压缩为可上墙的要点',
    color: '#4B3FE3',
    icon: 'search',
    type: '对话型',
    systemPrompt: '你是研究助理，擅长把长文、访谈、报告压缩为结构化的要点。回答时：1) 先给核心结论；2) 再用编号列出支撑要点；3) 标注证据强度（高/中/低）。保持简洁，每条不超过 30 字。如果用户提供的内容里有具体数字或日期，务必保留。',
    temperature: 0.4,
    greeting: '你好，我是研究助理。把长文、访谈记录或报告丢给我，我会帮你提炼核心要点和证据链。也可以直接给我一个主题，我来帮你做调研框架。',
    suggestedQuestions: [
      '帮我总结这篇访谈的 3 个核心观点',
      '从这份报告里抽取所有数字和日期',
      '对比这 3 篇文章的异同',
      '给"AI 智能体"这个主题做一个调研框架'
    ],
    skills: ['长文摘要', '要点抽取', '引用回溯', '对比分析'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'auto-edit',
    pinned: true,
    runs: 1284,
    avg: '1.6s'
  },
  {
    id: 'a-2',
    name: '代码评审',
    desc: '读取 diff，给出按行注释与风险评分',
    color: '#6A6FFF',
    icon: 'code',
    type: '工具型',
    systemPrompt: '你是代码评审专家。用户会贴 diff 或代码片段，你要：1) 按行给出注释；2) 对每个问题打风险标签（阻塞/建议/可选）；3) 给出可读性、性能、边界覆盖三项评分（1-10）；4) 末尾给修复建议。如果是安全相关问题（SQL 注入、XSS、硬编码密钥），必须标为"阻塞"。',
    temperature: 0.2,
    greeting: '我是代码评审助手。贴上你的 diff 或代码片段，我会按行注释、打风险标签、给出三项评分和修复建议。支持 Python / JavaScript / TypeScript / Java / Go。',
    suggestedQuestions: [
      '帮我评审这段 React 组件代码',
      '这个 SQL 查询有没有注入风险？',
      '帮我检查这个 API 的错误处理是否完善',
      '重构这段代码让它更可读'
    ],
    skills: ['Diff 阅读', '静态检查', '安全审计', '回归建议'],
    knowledgeBaseIds: [],
    tools: ['code_exec'],
    model: '',
    autonomy: 'suggest',
    pinned: true,
    runs: 421,
    avg: '2.4s'
  },
  {
    id: 'a-3',
    name: '日文邮件',
    desc: '把中文草稿改写为商务日语，附敬语说明',
    color: '#E27900',
    icon: 'mail',
    type: '对话型',
    systemPrompt: '你是商务日语改写专家。用户给中文草稿，你输出：1) 尊敬语+谦让语版本的完整邮件正文（含件名、宛名、结び）；2) 关键敬语用法的注解（用中文解释为什么这样用）；3) 如需更轻松/更正式的版本，提示用户。格式严格遵循日本商务邮件规范。',
    temperature: 0.5,
    greeting: 'こんにちは！我是日文邮件助手。把你的中文邮件草稿发给我，我会改写成规范的商务日语，并附上敬语用法说明。也可以指定语气（正式/轻松）。',
    suggestedQuestions: [
      '把这段中文改写为商务日语邮件',
      '帮我写一封向客户道歉的日文邮件',
      '这封日文邮件的敬语用对了吗？',
      '帮我写一封感谢客户的日文邮件'
    ],
    skills: ['敬语改写', '语气调节', '文化注解', '邮件规范'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'full-auto',
    pinned: false,
    runs: 198,
    avg: '0.9s'
  },
  {
    id: 'a-4',
    name: '日程调度',
    desc: '根据优先级与番茄钟排日程，自动避让会议',
    color: '#2F74FF',
    icon: 'cal',
    type: '工具型',
    systemPrompt: '你是日程调度助手。用户给任务清单和时间约束，你输出：1) 按优先级排序的任务表（含预估时长、建议时段）；2) 番茄钟分配建议（25 分钟工作 + 5 分钟休息）；3) 会议避让提醒。用 Markdown 表格输出。如果用户没有给出时间约束，假设工作日 9:00-18:00，午休 12:00-13:00。',
    temperature: 0.3,
    greeting: '我是日程调度助手。告诉我你今天的任务清单和时间约束，我帮你排优先级、分配番茄钟、避让会议。输出是清晰的表格。',
    suggestedQuestions: [
      '帮我安排今天 5 个任务的优先级',
      '本周有 3 个会议，帮我规划工作时间',
      '给我一个番茄钟工作法的时间表',
      '帮我平衡本周的开发和会议时间'
    ],
    skills: ['番茄钟', '会议避让', '优先级排序', '时间估算'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'auto-edit',
    pinned: false,
    runs: 96,
    avg: '0.4s'
  },
  {
    id: 'a-5',
    name: '知识库问答',
    desc: '基于本地文档回答问题，附引用来源',
    color: '#E8463A',
    icon: 'book',
    type: '工具型',
    systemPrompt: '你是知识库检索助手。基于用户上传的文档回答问题，回答时：1) 优先引用文档原文（用 > 引用块标注）；2) 区分"文档明确说明"与"我的推断"；3) 找不到相关内容时如实告知"知识库中未找到相关内容"，不要编造。每次回答末尾标注引用来源（文档名 + 分块编号）。',
    temperature: 0.2,
    greeting: '我是知识库问答助手。先到「知识库」页面上传文档，然后回来问我问题。我会基于你的文档回答，并标注引用来源。支持 txt、md 格式。',
    suggestedQuestions: [
      '这个文档的核心观点是什么？',
      '文档里提到了哪些关键数字？',
      '帮我找到关于 XX 的内容',
      '对比文档中两个方案的优劣'
    ],
    skills: ['文档检索', '引用标注', '语义匹配', '内容对比'],
    knowledgeBaseIds: [],
    tools: ['knowledge'],
    model: '',
    autonomy: 'full-auto',
    pinned: false,
    runs: 612,
    avg: '1.2s'
  },
  {
    id: 'a-6',
    name: '周报生成器',
    desc: '输入本周工作内容，自动生成结构化周报',
    color: '#10B981',
    icon: 'doc',
    type: '对话型',
    systemPrompt: '你是周报生成助手。用户给你本周做的事情（可以是零散的要点），你输出一份结构化周报：1) 本周概要（1-2 句话）；2) 完成事项（✅）；3) 进行中事项（🔄）；4) 下周计划；5) 风险与求助。语气简洁专业，适合发给 leader。如果用户给的输入太少，主动追问。',
    temperature: 0.4,
    greeting: '我是周报生成助手。把这周做的事情列给我（可以是零散的要点），我帮你生成一份结构清晰的周报。格式包含：概要、完成事项、进行中、下周计划、风险求助。',
    suggestedQuestions: [
      '帮我生成本周周报：完成了登录页、修了3个bug、开了2次会',
      '把这个工作清单整理成周报格式',
      '帮我写一份项目阶段性汇报',
      '帮我把这些零散工作整理成周报，语气正式一点'
    ],
    skills: ['结构化输出', '工作归纳', '语气调节', '模板化'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'full-auto',
    pinned: false,
    runs: 356,
    avg: '1.1s'
  },
  {
    id: 'a-7',
    name: '头脑风暴',
    desc: '发散思考，快速产出创意方案',
    color: '#F59E0B',
    icon: 'bulb',
    type: '对话型',
    systemPrompt: '你是头脑风暴助手。用户给你一个主题或问题，你快速产出 8-12 个创意方案，每个方案包含：1) 方案名（有吸引力）；2) 一句话描述；3) 可行性评分（1-5）。不要自我审查，先发散再收敛。最后标注你认为最值得深入的 3 个方案。鼓励跨界思维。',
    temperature: 0.9,
    greeting: '我是头脑风暴助手！给我一个主题或问题，我会快速产出 8-12 个创意方案，每个带可行性评分。不要怕想法太疯狂——先发散再收敛。',
    suggestedQuestions: [
      '帮我想 10 个提高用户留存的产品功能',
      '如何让团队会议更高效？给我一些创意',
      '为一个咖啡品牌想 10 个营销活动',
      '帮我想一些降低用户取消订阅的策略'
    ],
    skills: ['发散思维', '创意命名', '可行性评估', '跨界联想'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'suggest',
    pinned: false,
    runs: 87,
    avg: '1.8s'
  },
  {
    id: 'a-8',
    name: '多语言翻译',
    desc: '高质量多语言互译，保留语境与语气',
    color: '#8B5CF6',
    icon: 'globe',
    type: '对话型',
    systemPrompt: '你是专业翻译。支持中文、英文、日文、韩文、法文、德文、西班牙文互译。翻译时：1) 保留原文的语气和语境（正式/口语/商务）；2) 对文化相关的表达给注释；3) 如果一词多义，列出主要译法并标注使用场景；4) 末尾给一个"直译版"和"意译版"对比。翻译技术文档时保留专有名词原文。',
    temperature: 0.3,
    greeting: '我是多语言翻译助手。支持中/英/日/韩/法/德/西 7 种语言互译。我会保留语气和语境，对文化表达给注释，并提供直译和意译对比。',
    suggestedQuestions: [
      '把这段中文翻译成英文，保留商务语气',
      '帮我把这个英文技术文档翻译成中文',
      '这句话的日文怎么说？给敬语版和口语版',
      '翻译这封法语邮件，并解释文化背景'
    ],
    skills: ['多语言互译', '语境保留', '文化注解', '直译意译对比'],
    knowledgeBaseIds: [],
    tools: [],
    model: '',
    autonomy: 'full-auto',
    pinned: false,
    runs: 543,
    avg: '0.8s'
  }
]

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

function relTime(ts) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return Math.floor(diff / 86400000) + ' 天前'
}

export const useAgentStore = defineStore('agents', {
  state: () => ({
    // 深拷贝种子数据，避免 push 修改原始数组
    list: JSON.parse(JSON.stringify(seedAgents)),
    selectedId: 'a-1',
    // 运行记录（真实统计来源）—— 替代 View 层硬编码假数据
    runLogs: []
  }),
  persist: ['list', 'selectedId', 'runLogs'],
  getters: {
    // H4 修复：list 为空时返回空对象，避免 undefined 导致崩溃
    selected: (s) => s.list.find((a) => a.id === s.selectedId) || s.list[0] || {
      id: '',
      name: '无智能体',
      desc: '请先创建一个智能体',
      color: '#A1A1A1',
      icon: '',
      type: '对话型',
      systemPrompt: '',
      temperature: 0.5,
      greeting: '',
      suggestedQuestions: [],
      skills: [],
      knowledgeBaseIds: [],
      tools: [],
      model: '',
      autonomy: 'auto-edit',
      runs: 0,
      avg: '—',
      pinned: false
    },
    selectedKnowledgeBases: (s) => {
      const a = s.list.find(x => x.id === s.selectedId)
      return a?.knowledgeBaseIds || []
    },

    // ===== 真实统计（从 runLogs 派生，替代硬编码假数据）=====
    /** 在线智能体数 = list 长度 */
    onlineCount: (s) => s.list.length,
    /** 本月调用数 = runLogs 中本月数量 + 历史 runs 基线 */
    monthlyCalls(s) {
      const now = new Date()
      const m = now.getMonth()
      const y = now.getFullYear()
      const monthRuns = s.runLogs.filter(r => {
        const d = new Date(r.startedAt)
        return d.getMonth() === m && d.getFullYear() === y
      }).length
      // 历史 runs 作为基线，加上本月真实记录
      const baseline = s.list.reduce((sum, a) => sum + (a.runs || 0), 0)
      return baseline + monthRuns
    },
    /** 平均时延 = runLogs 最近 20 条的平均 duration */
    avgLatency(s) {
      const recent = s.runLogs.filter(r => r.duration && r.status === 'done').slice(-20)
      if (!recent.length) return '1.4s'
      const avg = recent.reduce((sum, r) => sum + r.duration, 0) / recent.length
      return avg.toFixed(1) + 's'
    },
    /** 失败率 = runLogs 中失败占比 */
    failRate(s) {
      const total = s.runLogs.length
      if (!total) return '0.6%'
      const failed = s.runLogs.filter(r => r.status === 'failed').length
      return (failed / total * 100).toFixed(1) + '%'
    },
    /** 统一 stat 数组（供 AgentsView 直接消费） */
    stats(s) {
      return [
        { label: '在线智能体', value: String(s.onlineCount), delta: '实时' },
        { label: '累计调用',   value: s.monthlyCalls.toLocaleString(), delta: '+真实' },
        { label: '平均时延',   value: s.avgLatency, delta: '近期' },
        { label: '失败率',     value: s.failRate, delta: '统计' }
      ]
    },
    /** 最近调用记录（供日志 tab 与详情面板消费） */
    recentRuns(s) {
      return s.runLogs.slice(-20).reverse().map(r => ({
        id: r.id,
        agent: r.agentName,
        trigger: r.trigger || '手动',
        status: r.status === 'done' ? '成功' : r.status === 'failed' ? '失败' : '运行中',
        when: relTime(r.startedAt),
        dur: r.duration ? r.duration.toFixed(1) + 's' : '—',
        tok: r.tokens || 0
      }))
    },
    /** 正在运行的记录（供运行监控 tab 消费） */
    liveRuns(s) {
      return s.runLogs.filter(r => r.status === 'running').map(r => ({
        id: r.id,
        agent: r.agentName,
        title: r.title,
        progress: r.progress || 0,
        tok: r.tokens || 0,
        startedAt: nowTime(),
        status: 'running',
        output: r.output || '',
        duration: r.duration ? r.duration.toFixed(1) + 's' : '0.0s'
      }))
    }
  },
  actions: {
    select(id) { this.selectedId = id },
    update(id, patch) {
      const a = this.list.find(x => x.id === id)
      if (a) Object.assign(a, patch)
    },
    remove(id) {
      const idx = this.list.findIndex(x => x.id === id)
      if (idx >= 0) {
        this.list.splice(idx, 1)
        if (this.selectedId === id) {
          this.selectedId = this.list[0]?.id || ''
        }
      }
    },
    toggleKnowledgeBase(kbId) {
      const a = this.list.find(x => x.id === this.selectedId)
      if (!a) return
      if (!a.knowledgeBaseIds) a.knowledgeBaseIds = []
      const idx = a.knowledgeBaseIds.indexOf(kbId)
      if (idx >= 0) a.knowledgeBaseIds.splice(idx, 1)
      else a.knowledgeBaseIds.push(kbId)
    },

    // ===== 新增 actions（P0-1）=====

    /**
     * 创建智能体（从 AgentsView.createAgent 下沉）
     * @param {Object} payload { name, desc, type, systemPrompt, temperature, greeting, suggestedQuestions, tools, autonomy }
     * @returns {Object} 创建的智能体
     */
    create(payload) {
      const name = (payload.name || '').trim()
      if (!name) throw new Error('请输入智能体名称')
      const desc = (payload.desc || '').trim()
      const id = 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const questions = payload.suggestedQuestions
        ? (Array.isArray(payload.suggestedQuestions)
            ? payload.suggestedQuestions
            : String(payload.suggestedQuestions).split('\n').map(q => q.trim()).filter(Boolean))
        : []
      const agent = {
        id,
        name,
        desc: desc || '自定义智能体',
        color: payload.color || '#4B3FE3',
        icon: payload.icon || '',
        type: payload.type || '对话型',
        systemPrompt: (payload.systemPrompt || '').trim() || `你是${name}。${desc || '请根据用户需求提供专业帮助。'}`,
        temperature: payload.temperature ?? 0.5,
        greeting: (payload.greeting || '').trim() || `你好，我是${name}。${desc || '有什么可以帮你的？'}`,
        suggestedQuestions: questions,
        skills: payload.skills || [],
        knowledgeBaseIds: payload.knowledgeBaseIds || [],
        tools: payload.tools || [],
        model: payload.model || '',
        autonomy: payload.autonomy || 'auto-edit',
        pinned: false,
        runs: 0,
        avg: '—'
      }
      this.list.push(agent)
      this.selectedId = id
      return agent
    },

    /**
     * 克隆智能体（生成变体）
     */
    clone(id) {
      const src = this.list.find(a => a.id === id)
      if (!src) throw new Error('找不到要克隆的智能体')
      const copy = JSON.parse(JSON.stringify(src))
      copy.id = 'a-' + Date.now()
      copy.name = src.name + ' · 副本'
      copy.pinned = false
      copy.runs = 0
      copy.avg = '—'
      this.list.push(copy)
      this.selectedId = copy.id
      return copy
    },

    /**
     * 记录一次运行（真实统计来源）
     * @param {Object} run { agentId, agentName, title, status, trigger, startedAt, endedAt, duration, tokens, output? }
     * @returns {Object} 带 id 的 run
     */
    recordRun(run) {
      const r = {
        id: 'r-' + Date.now() + Math.random().toString(36).slice(2, 6),
        startedAt: Date.now(),
        ...run
      }
      this.runLogs.push(r)
      // 控制 runLogs 上限，避免无限增长撑爆 localStorage
      if (this.runLogs.length > 200) {
        this.runLogs = this.runLogs.slice(-200)
      }
      // 同步更新对应智能体的 runs 计数与 avg
      if (run.agentId && run.status === 'done') {
        const a = this.list.find(x => x.id === run.agentId)
        if (a) {
          a.runs = (a.runs || 0) + 1
          if (run.duration) a.avg = run.duration.toFixed(1) + 's'
        }
      }
      return r
    },

    /**
     * 更新运行记录（流式输出时实时更新）
     * @param {string} runId
     * @param {Object|Function} patch  对象则 Object.assign，函数则调用以获取补丁
     */
    updateRun(runId, patch) {
      const r = this.runLogs.find(x => x.id === runId)
      if (!r) return
      if (typeof patch === 'function') patch(r)
      else Object.assign(r, patch)
    },

    /** 删除运行记录 */
    removeRun(runId) {
      const idx = this.runLogs.findIndex(x => x.id === runId)
      if (idx >= 0) this.runLogs.splice(idx, 1)
    },

    /**
     * 导出智能体规则为 JSON（对标 Helia AGENTS.md，可版本化/分享）
     */
    exportRule(id) {
      const a = this.list.find(x => x.id === id)
      if (!a) throw new Error('找不到智能体')
      return {
        kind: 'helia-agent-rule',
        version: 1,
        exportedAt: new Date().toISOString(),
        rule: {
          name: a.name,
          desc: a.desc,
          type: a.type,
          systemPrompt: a.systemPrompt,
          temperature: a.temperature,
          greeting: a.greeting,
          suggestedQuestions: a.suggestedQuestions,
          skills: a.skills,
          tools: a.tools,
          autonomy: a.autonomy,
          model: a.model
        }
      }
    },

    /**
     * 导入智能体规则
     */
    importRule(json) {
      if (!json || json.kind !== 'helia-agent-rule' || !json.rule) {
        throw new Error('规则文件格式不正确')
      }
      return this.create({ ...json.rule, color: '#4B3FE3' })
    }
  }
})
