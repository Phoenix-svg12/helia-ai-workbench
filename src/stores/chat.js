import { defineStore } from 'pinia'
import { chat as aiChat } from '@/services/ai'
import { callTool } from '@/services/tools'
import { useAgentStore } from '@/stores/agents'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSettingsStore } from '@/stores/settings'

// 模块级闭包变量：流式 timer 与 AbortController
let _streamTimers = []
let _abortController = null

const seedThreads = [
  {
    id: 't-1',
    title: '产品周报要点梳理',
    group: '工作',
    updated: '刚刚',
    pinned: true,
    preview: '把本周三场客户访谈合并成 6 条可上墙的结论…',
    unread: 0
  },
  {
    id: 't-2',
    title: '为新组件库写技术选型',
    group: '工作',
    updated: '2 小时前',
    pinned: false,
    preview: '对比 shadcn-vue、Radix Vue、Naive UI 在 a11y 上的差异…',
    unread: 2
  },
  {
    id: 't-3',
    title: '论文阅读: Mamba 的状态空间',
    group: '研究',
    updated: '昨天',
    pinned: false,
    preview: 'SSM 的离散化与 HiPPO 初始化动机整理…',
    unread: 0
  },
  {
    id: 't-4',
    title: '日文敬语改写',
    group: '生活',
    updated: '周三',
    pinned: false,
    preview: '把商务邮件改写成尊敬语 + 谦让语风格…',
    unread: 0
  },
  {
    id: 't-5',
    title: 'Prompt 模板: 客户调研',
    group: '模板',
    updated: '上周',
    pinned: false,
    preview: '字段化输入，自动产出 5 段式访谈摘要…',
    unread: 0
  }
]

const seedMessages = [
  {
    id: 'm-1',
    role: 'user',
    content: '帮我把这周的三场客户访谈合并成 6 条可上墙的结论，每条不超过 30 字。',
    ts: '10:24'
  },
  {
    id: 'm-2',
    role: 'assistant',
    content: `好的，已读取本周三份访谈记录。整理如下：

1. 客户希望首屏"看见价值"的时间 ≤ 3 秒。
2. 报告导出是高频场景，但模板不够灵活。
3. 多人协作时权限粒度需要"页面级"。
4. 移动端只读不写，跨端同步存在延迟。
5. 自定义字段上限 32 已成为业务阻力。
6. 客户对"使用 AI 但不把数据外发"非常敏感。

需要我把这些结论改写为"问题—影响—机会"三栏格式吗？`,
    ts: '10:24',
    model: 'Helia-Pro',
    tokens: 412,
    duration: '1.8s'
  },
  {
    id: 'm-3',
    role: 'user',
    content: '先不用，我直接拿去和 PM 同步。下一步给我一份对应到 v2.3 路线图的 5 个候选主题。',
    ts: '10:26'
  },
  {
    id: 'm-4',
    role: 'assistant',
    content: `候选主题（按预期影响从高到低）：

| 主题 | 关联结论 | 估时 |
| --- | --- | --- |
| 价值秒表与首屏改造 | #1, #4 | 2 sprint |
| 报告模板引擎 | #2 | 1.5 sprint |
| 页面级权限 | #3 | 1 sprint |
| 自定义字段扩展 | #5 | 0.5 sprint |
| 本地优先 + 加密同步 | #6 | 2 sprint |

我先按"价值秒表"起草一份 PRD 大纲，要继续吗？`,
    ts: '10:26',
    model: 'Helia-Pro',
    tokens: 286,
    duration: '1.4s'
  }
]

export const useChatStore = defineStore('chat', {
  state: () => ({
    threads: seedThreads,
    activeId: 't-1',
    messages: {
      't-1': seedMessages,
      't-2': [],
      't-3': [],
      't-4': [],
      't-5': []
    },
    composer: '',
    isStreaming: false,
    model: 'Helia-Pro',
    temperature: 0.6,
    webSearch: false,
    artifacts: true,
    sendOnEnter: true
  }),
  persist: ['threads', 'messages', 'activeId', 'model', 'temperature', 'webSearch', 'artifacts', 'sendOnEnter'],
  getters: {
    activeThread: (s) => s.threads.find((t) => t.id === s.activeId) || s.threads[0] || null,
    activeMessages: (s) => (s.activeId ? (s.messages[s.activeId] || []) : [])
  },
  actions: {
    setActive(id) {
      this.cancelStream()
      this.activeId = id
      const t = this.threads.find((x) => x.id === id)
      if (t) t.unread = 0
    },
    newThread() {
      const id = 't-' + Date.now()
      this.threads.unshift({
        id,
        title: '新对话',
        group: '工作',
        updated: '刚刚',
        pinned: false,
        preview: '',
        unread: 0
      })
      this.messages[id] = []
      this.activeId = id
    },
    deleteThread(id) {
      // 如果删除的是当前活跃对话，先取消流式生成
      if (this.activeId === id) this.cancelStream()
      const idx = this.threads.findIndex((t) => t.id === id)
      if (idx < 0) return
      this.threads.splice(idx, 1)
      delete this.messages[id]
      if (this.activeId === id) {
        this.activeId = this.threads[0]?.id || null
      }
    },

    /**
     * 构建当前对话的 systemPrompt（含知识库 RAG 注入）
     * 重构说明（P0）：从 ChatView.activeSystemPrompt 下沉
     * 1. 取选中智能体的 systemPrompt，没有则用 settings.defaultSystem
     * 2. 若智能体绑定了知识库，检索 composer 相关内容注入
     * @param {string} query 用于 RAG 检索的查询（通常为待发送消息）
     * @returns {string} 完整 systemPrompt
     */
    activeSystemPrompt(query = '') {
      const agents = useAgentStore()
      const knowledge = useKnowledgeStore()
      let prompt = agents.selected?.systemPrompt || ''
      const kbIds = agents.selected?.knowledgeBaseIds || []
      if (kbIds.length && query.trim()) {
        const context = knowledge.buildContext(query.trim(), 3)
        if (context) {
          prompt += '\n\n以下是从知识库检索到的相关内容，请参考这些内容回答用户问题：\n\n' + context
        }
      }
      return prompt
    },

    /**
     * 发送消息
     * @param {string} content
     * @param {string} systemPrompt 可选，不传则用 activeSystemPrompt(content)
     */
    send(content, systemPrompt) {
      if (!content.trim() || this.isStreaming) return
      if (!this.activeId || !this.threads.find((t) => t.id === this.activeId)) {
        this.newThread()
      }
      const id = this.activeId
      if (!this.messages[id]) this.messages[id] = []
      this.messages[id].push({
        id: 'm-' + Date.now(),
        role: 'user',
        content,
        ts: new Date().toTimeString().slice(0, 5)
      })
      this.composer = ''
      const sysPrompt = systemPrompt || this.activeSystemPrompt(content)
      this._simulateReply(sysPrompt)
    },

    /**
     * 重新生成指定消息
     * 重构说明（P0）：从 ChatView.regenerate 下沉
     * @param {string} messageId 要重新生成的 assistant 消息 id
     */
    regenerate(messageId) {
      if (!this.activeId || this.isStreaming) return false
      const msgs = this.messages[this.activeId]
      if (!msgs) return false
      const idx = msgs.findIndex(x => x.id === messageId)
      if (idx < 0) return false
      // 取上一条 user 消息作为输入
      const lastUser = [...msgs.slice(0, idx)].reverse().find(m => m.role === 'user')
      msgs.splice(idx, 1)
      // 在原位置插入新的 assistant 回复，而非追加到末尾（保持对话顺序）
      this._simulateReply(this.activeSystemPrompt(lastUser?.content || ''), idx)
      return true
    },

    cancelStream() {
      _streamTimers.forEach(clearTimeout)
      _streamTimers = []
      if (_abortController) {
        try { _abortController.abort() } catch {}
        _abortController = null
      }
      this.isStreaming = false
    },

    clearAll() {
      this.cancelStream()
      this.threads = []
      this.messages = {}
      this.activeId = null
      this.composer = ''
      this.isStreaming = false
    },

    clearThreadMessages(id) {
      if (!id) return
      if (this.activeId === id) this.cancelStream()
      if (this.messages[id]) this.messages[id] = []
    },

    /** 切换对话置顶状态 */
    togglePin(id) {
      const t = this.threads.find((x) => x.id === (id || this.activeId))
      if (t) t.pinned = !t.pinned
      return t?.pinned
    },

    /** 重命名对话 */
    renameThread(id, title) {
      const t = this.threads.find((x) => x.id === (id || this.activeId))
      if (t && title.trim()) t.title = title.trim()
    },

    /** 设置消息反馈（点赞/不喜欢） */
    setMessageFeedback(messageId, type) {
      const msgs = this.messages[this.activeId]
      if (!msgs) return
      const m = msgs.find((x) => x.id === messageId)
      if (!m) return
      m.feedback = m.feedback === type ? null : type
    },

    /** 截断消息：删除指定消息及其后所有消息（用于编辑重发） */
    truncateAfter(messageId) {
      const msgs = this.messages[this.activeId]
      if (!msgs) return
      const idx = msgs.findIndex(m => m.id === messageId)
      if (idx < 0) return
      msgs.splice(idx) // 删除该消息及之后所有消息
    },

    // 真实 AI 回复：调用 services/ai.js 的 chat()
    async _simulateReply(systemPrompt, insertIdx) {
      this.isStreaming = true
      const id = this.activeId
      const startedAt = Date.now()
      const replyId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const agents = useAgentStore()
      const settings = useSettingsStore()
      // 使用智能体的 temperature（如有选中），否则用全局 temperature
      const useTemp = agents.selected?.temperature ?? this.temperature
      // 记录实际使用的真实模型名
      const realModelName = settings.isConfigured ? settings.realModel(this.model) : this.model
      const reply = {
        id: replyId,
        role: 'assistant',
        content: '',
        ts: new Date().toTimeString().slice(0, 5),
        model: realModelName,
        tokens: 0,
        duration: '0.0s',
        typing: true
      }
      if (typeof insertIdx === 'number' && insertIdx >= 0) {
        this.messages[id].splice(insertIdx, 0, reply)
      } else {
        this.messages[id].push(reply)
      }

      const history = (this.messages[id] || [])
        .filter(m => m.id !== replyId && m.content)
        .map(m => ({ role: m.role, content: m.content }))

      _abortController = new AbortController()
      const signal = _abortController.signal

      // 网络搜索增强：webSearch 开启且已配置搜索 API Key 时，先搜索再调 AI
      let enhancedPrompt = systemPrompt
      if (this.webSearch && settings.searchApiKey) {
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user')
        if (lastUserMsg) {
          reply.content = '🔍 正在搜索网络获取最新信息…\n\n'
          try {
            const searchResult = await callTool('web_search', lastUserMsg.content, { signal })
            if (!searchResult.includes('未配置') && !searchResult.includes('搜索失败')) {
              enhancedPrompt = (systemPrompt || '') +
                '\n\n以下是网络搜索结果，请参考这些信息回答用户问题：\n\n' + searchResult
            }
            reply.content = '' // 清空状态提示，准备接收 AI 流式回复
          } catch (e) {
            if (e?.name === 'AbortError') throw e
            reply.content = '' // 清空，继续调用 AI
          }
        }
      }

      try {
        const fullText = await aiChat({
          messages: history,
          model: this.model,
          temperature: useTemp,
          systemPrompt: enhancedPrompt,
          signal,
          onDelta: (chunk) => {
            if (!this.messages[id]) return
            reply.content += chunk
          }
        })
        if (!this.messages[id]) {
          this.isStreaming = false
          return
        }
        reply.content = fullText || reply.content
        reply.typing = false
        reply.duration = ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
        reply.tokens = Math.max(50, Math.ceil(fullText.length / 2.5))
        this.isStreaming = false
        const t = this.threads.find(x => x.id === id)
        if (t) {
          t.preview = (history[history.length - 1]?.content || '').slice(0, 40)
          t.updated = '刚刚'
        }
      } catch (e) {
        this.isStreaming = false
        if (e?.name === 'AbortError') {
          reply.typing = false
          if (!reply.content) reply.content = '（已停止）'
          return
        }
        reply.typing = false
        reply.content = reply.content || `⚠️ 调用失败：${e.message}\n\n请到「设置 → AI 服务」检查 API 配置。`
        reply.duration = ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
      } finally {
        _abortController = null
      }
    }
  }
})
