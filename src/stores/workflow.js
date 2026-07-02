import { defineStore } from 'pinia'
import { chatOnce, localFallback } from '@/services/ai'
import { useAgentStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'

/**
 * 工作流 store —— 多工作流版本，每个工作流独立画布。
 *
 * 数据模型：
 *   workflows: [{ id, name, nodes, edges, viewport, createdAt, lastRunAt }]
 *   activeWorkflowId: 当前激活的工作流 id
 *   selectedNodeId / selectedEdgeKey: 全局选中态（切换工作流时清空）
 *   runs: 全局执行记录
 *   activeRunId: 当前运行 id
 *   isExecuting: 是否正在执行（用于开始/停止）
 *
 * nodes/edges/viewport 通过 getter 代理到 activeWorkflow，子组件无需改动。
 * 节点/边/视口操作 action 都作用于 activeWorkflow。
 */

const DEFAULT_NODES = [
  { id: 'io1', type: 'io',    label: '输入',     x: 24,  y: 120, w: 40,  h: 40, direction: 'in' },
  { id: 'a-1', type: 'agent', label: '研究助理',  x: 120, y: 70,  w: 200, h: 84 },
  { id: 'a-5', type: 'agent', label: '本地知识库', x: 460, y: 230, w: 200, h: 84 },
  { id: 'a-2', type: 'agent', label: '代码评审',  x: 800, y: 70,  w: 200, h: 84 },
  { id: 'a-3', type: 'tool',  label: 'Web 搜索',  x: 200, y: 360, w: 180, h: 64, toolId: 'web_search' },
  { id: 'a-4', type: 'tool',  label: '番茄钟',    x: 560, y: 380, w: 180, h: 64, toolId: 'code_exec' },
  { id: 'io2', type: 'io',    label: '输出',     x: 1040, y: 120, w: 40,  h: 40, direction: 'out' }
]

const DEFAULT_EDGES = [
  { from: 'io1', to: 'a-1' },
  { from: 'a-1', to: 'a-5' },
  { from: 'a-5', to: 'a-2' },
  { from: 'a-1', to: 'a-3' },
  { from: 'a-5', to: 'a-4' },
  { from: 'a-2', to: 'io2' }
]

function _defaultViewport() {
  return { zoom: 1, panX: 0, panY: 0, fullscreen: false }
}

function _blankWorkflow(name = '新工作流') {
  return {
    id: 'wf-' + Date.now() + Math.random().toString(36).slice(2, 5),
    name,
    nodes: [
      { id: 'io1-' + Date.now(), type: 'io', label: '输入', x: 24, y: 120, w: 40, h: 40, direction: 'in' },
      { id: 'io2-' + Date.now(), type: 'io', label: '输出', x: 600, y: 120, w: 40, h: 40, direction: 'out' }
    ],
    edges: [],
    viewport: _defaultViewport(),
    createdAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    lastRunAt: null
  }
}

// 从 localStorage 读取并迁移旧版数据（单工作流 → 多工作流）
function _initWorkflows() {
  try {
    const raw = localStorage.getItem('helia:workflow')
    if (raw) {
      const saved = JSON.parse(raw)
      // 新版：已有 workflows 字段
      if (saved && Array.isArray(saved.workflows) && saved.workflows.length) {
        return saved.workflows
      }
      // 旧版：有 nodes/edges，包装成第一个工作流
      if (saved && Array.isArray(saved.nodes) && saved.nodes.length) {
        const hasPos = saved.nodes[0] && typeof saved.nodes[0].x === 'number'
        const nodes = hasPos ? saved.nodes : _migrateOldNodes(saved.nodes)
        return [{
          id: 'wf-default',
          name: '默认工作流',
          nodes,
          edges: Array.isArray(saved.edges) ? saved.edges : JSON.parse(JSON.stringify(DEFAULT_EDGES)),
          viewport: saved.viewport || _defaultViewport(),
          createdAt: '默认',
          lastRunAt: null
        }]
      }
    }
  } catch {}
  // 全新：用默认工作流
  return [{
    id: 'wf-default',
    name: '研究摘要工作流',
    nodes: JSON.parse(JSON.stringify(DEFAULT_NODES)),
    edges: JSON.parse(JSON.stringify(DEFAULT_EDGES)),
    viewport: _defaultViewport(),
    createdAt: '默认',
    lastRunAt: null
  }]
}

function _migrateOldNodes(oldNodes) {
  const map = new Map(DEFAULT_NODES.map(n => [n.id, n]))
  return oldNodes.map(n => {
    const def = map.get(n.id)
    return def ? { ...def, ...n } : { x: 100, y: 100, w: 180, h: 64, ...n }
  })
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflows: _initWorkflows(),
    activeWorkflowId: '',
    runs: [],
    activeRunId: null,
    isExecuting: false,
    selectedNodeId: null,
    selectedEdgeKey: null
  }),
  persist: ['workflows', 'activeWorkflowId'],
  getters: {
    activeWorkflow: (s) => s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0] || null,
    activeWorkflowIdResolved: (s) => s.activeWorkflowId || (s.workflows[0]?.id || ''),
    // 代理到 activeWorkflow，子组件可像以前一样用 workflow.nodes
    nodes: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return wf?.nodes || []
    },
    edges: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return wf?.edges || []
    },
    viewport: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return wf?.viewport || _defaultViewport()
    },
    isRunning: (s) => s.activeRunId !== null,
    activeRun: (s) => s.runs.find(r => r.id === s.activeRunId) || null,
    // 当前正在执行的节点 ID
    executingNodeId: (s) => {
      const run = s.runs.find(r => r.id === s.activeRunId)
      if (!run) return null
      const step = run.steps.find(st => st.status === 'running')
      return step?.nodeId || null
    },
    // 所有已完成步骤的节点 ID 数组
    completedNodeIds: (s) => {
      const run = s.runs.find(r => r.id === s.activeRunId)
      if (!run) return []
      return run.steps.filter(st => st.status === 'done').map(st => st.nodeId)
    },
    ioNodes: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return (wf?.nodes || []).filter(n => n.type === 'io')
    },
    agentNodes: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return (wf?.nodes || []).filter(n => n.type === 'agent')
    },
    toolNodes: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return (wf?.nodes || []).filter(n => n.type === 'tool')
    },
    selectedNode: (s) => {
      const wf = s.workflows.find(w => w.id === s.activeWorkflowId) || s.workflows[0]
      return (wf?.nodes || []).find(n => n.id === s.selectedNodeId) || null
    },
    workflowCount: (s) => s.workflows.length
  },
  actions: {
    _ensureActive() {
      if (!this.activeWorkflowId || !this.workflows.find(w => w.id === this.activeWorkflowId)) {
        this.activeWorkflowId = this.workflows[0]?.id || ''
      }
    },

    // ===== 工作流管理 =====
    createWorkflow(name) {
      const wf = _blankWorkflow(name || '新工作流')
      this.workflows.push(wf)
      this.activeWorkflowId = wf.id
      this.selectedNodeId = null
      this.selectedEdgeKey = null
      return wf
    },
    deleteWorkflow(id) {
      const idx = this.workflows.findIndex(w => w.id === id)
      if (idx < 0) return
      if (this.workflows.length <= 1) return // 至少保留一个
      this.workflows.splice(idx, 1)
      if (this.activeWorkflowId === id) {
        this.activeWorkflowId = this.workflows[0]?.id || ''
        this.selectedNodeId = null
        this.selectedEdgeKey = null
      }
    },
    renameWorkflow(id, name) {
      const wf = this.workflows.find(w => w.id === id)
      if (wf) wf.name = name
    },
    switchWorkflow(id) {
      if (!this.workflows.find(w => w.id === id)) return
      this.activeWorkflowId = id
      this.selectedNodeId = null
      this.selectedEdgeKey = null
    },
    duplicateWorkflow(id) {
      const src = this.workflows.find(w => w.id === id)
      if (!src) return null
      const copy = JSON.parse(JSON.stringify(src))
      copy.id = 'wf-' + Date.now() + Math.random().toString(36).slice(2, 5)
      copy.name = src.name + ' · 副本'
      copy.createdAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      copy.lastRunAt = null
      this.workflows.push(copy)
      this.activeWorkflowId = copy.id
      this.selectedNodeId = null
      this.selectedEdgeKey = null
      return copy
    },

    // ===== 节点/边操作（作用于 activeWorkflow）=====
    addNode(node) {
      this._ensureActive()
      const wf = this.activeWorkflow
      if (!wf) return
      if (wf.nodes.find(n => n.id === node.id)) return
      wf.nodes.push({ x: 100, y: 100, w: 180, h: 64, ...node })
    },
    moveNode(id, x, y) {
      const wf = this.activeWorkflow
      if (!wf) return
      const n = wf.nodes.find(n => n.id === id)
      if (n) { n.x = x; n.y = y }
    },
    removeNode(id) {
      const wf = this.activeWorkflow
      if (!wf) return
      const idx = wf.nodes.findIndex(n => n.id === id)
      if (idx >= 0) wf.nodes.splice(idx, 1)
      wf.edges = wf.edges.filter(e => e.from !== id && e.to !== id)
      if (this.selectedNodeId === id) this.selectedNodeId = null
    },
    updateNode(id, patch) {
      const wf = this.activeWorkflow
      if (!wf) return
      const n = wf.nodes.find(n => n.id === id)
      if (n) Object.assign(n, patch)
    },
    addEdge(from, to) {
      const wf = this.activeWorkflow
      if (!wf) return
      if (from === to) return
      if (wf.edges.find(e => e.from === from && e.to === to)) return
      wf.edges.push({ from, to })
    },
    removeEdge(from, to) {
      const wf = this.activeWorkflow
      if (!wf) return
      const idx = wf.edges.findIndex(e => e.from === from && e.to === to)
      if (idx >= 0) wf.edges.splice(idx, 1)
      if (this.selectedEdgeKey === from + '->' + to) this.selectedEdgeKey = null
    },

    // ===== 选中状态 =====
    selectNode(id) { this.selectedNodeId = id; this.selectedEdgeKey = null },
    selectEdge(from, to) { this.selectedEdgeKey = from + '->' + to; this.selectedNodeId = null },
    clearSelection() { this.selectedNodeId = null; this.selectedEdgeKey = null },

    // ===== 视口控制（作用于 activeWorkflow）=====
    _patchViewport(patch) {
      const wf = this.activeWorkflow
      if (!wf) return
      Object.assign(wf.viewport, patch)
    },
    setZoom(z) {
      const zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100))
      this._patchViewport({ zoom })
    },
    zoomIn() { this.setZoom((this.viewport.zoom) + 0.1) },
    zoomOut() { this.setZoom((this.viewport.zoom) - 0.1) },
    pan(dx, dy) {
      this._patchViewport({ panX: this.viewport.panX + dx, panY: this.viewport.panY + dy })
    },
    setPan(x, y) { this._patchViewport({ panX: x, panY: y }) },
    setViewport(patch) { this._patchViewport(patch) },
    resetViewport() { this._patchViewport({ zoom: 1, panX: 0, panY: 0 }) },
    toggleFullscreen() {
      this._patchViewport({ fullscreen: !this.viewport.fullscreen })
    },

    // ===== 连线辅助 =====
    edgeKey(from, to) { return from + '->' + to },
    isEdgeSelected(from, to) { return this.selectedEdgeKey === from + '->' + to },
    downstream(nodeId) {
      const wf = this.activeWorkflow
      if (!wf) return []
      const visited = new Set()
      const queue = [nodeId]
      while (queue.length) {
        const cur = queue.shift()
        if (visited.has(cur)) continue
        visited.add(cur)
        wf.edges.filter(e => e.from === cur).forEach(e => {
          if (!visited.has(e.to)) queue.push(e.to)
        })
      }
      visited.delete(nodeId)
      return [...visited]
    },
    upstream(nodeId) {
      const wf = this.activeWorkflow
      if (!wf) return []
      return wf.edges.filter(e => e.to === nodeId).map(e => e.from)
    },

    // ===== 拓扑排序 =====
    _topoSort(startId) {
      const wf = this.activeWorkflow
      if (!wf) return []
      const visited = new Set()
      const order = []
      const queue = [startId]
      while (queue.length) {
        const cur = queue.shift()
        if (visited.has(cur)) continue
        visited.add(cur)
        const node = wf.nodes.find(n => n.id === cur)
        if (node && node.type !== 'io') order.push(cur)
        wf.edges.filter(e => e.from === cur).forEach(e => {
          if (!visited.has(e.to)) queue.push(e.to)
        })
      }
      return order
    },

    // ===== 执行控制（开始/停止）=====
    /**
     * 开始执行当前工作流
     * @param {string} input
     * @param {Object} opts { onStep, onDone, onError }
     */
    async startWorkflow(input, opts = {}) {
      if (this.isExecuting) return null
      this._ensureActive()
      const wf = this.activeWorkflow
      if (!wf) return null

      this.isExecuting = true
      const agents = useAgentStore()
      const chat = useChatStore()
      const { onStep, onDone, onError } = opts

      const runId = 'wf-' + Date.now()
      // 先创建 run 对象，push 到 runs 后通过 this.runs 访问响应式代理
      this.runs.unshift({
        id: runId,
        workflowId: wf.id,
        workflowName: wf.name,
        input,
        steps: [],
        output: '',
        status: 'running',
        startedAt: Date.now(),
        endedAt: null
      })
      this.activeRunId = runId

      // 通过响应式代理访问 run（关键修复：不能直接用局部变量操作）
      const getRun = () => this.runs.find(r => r.id === runId)

      // 找入口节点（输入 IO 节点）
      const ioStart = wf.nodes.find(n => n.type === 'io' && (n.direction === 'in' || n.label === '输入')) || wf.nodes.find(n => n.type === 'io')
      const startId = ioStart?.id || wf.nodes[0]?.id
      const order = this._topoSort(startId)
      let context = input
      const originalInput = input  // 保存原始输入，供工具节点使用

      try {
        for (const nodeId of order) {
          if (!this.isExecuting) {
            // 被停止
            const run = getRun()
            if (run) {
              run.status = 'stopped'
              run.output = context
              run.endedAt = Date.now()
            }
            this.activeRunId = null
            this.isExecuting = false
            wf.lastRunAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            onDone?.(getRun())
            return getRun()
          }
          const node = wf.nodes.find(n => n.id === nodeId)
          if (!node) continue

          // 通过响应式代理操作 step（关键修复）
          const run = getRun()
          const stepIdx = run.steps.length
          run.steps.push({
            nodeId, label: node.label, type: node.type,
            status: 'running', input: context, output: '',
            startedAt: Date.now(), endedAt: null
          })
          const step = run.steps[stepIdx]  // 响应式代理引用
          onStep?.(step)

          if (node.type === 'agent') {
            const agent = agents.list.find(a => a.id === nodeId)
            const systemPrompt = agent?.systemPrompt || `你是${node.label}。`
            const temperature = agent?.temperature ?? 0.5
            const result = await _chatOnceWithSystem({ systemPrompt, userContent: context, model: chat.model, temperature })
            step.output = result
            context = result
          } else if (node.type === 'tool') {
            // 工具节点：web_search 使用原始输入而非上下文（避免被前序节点输出污染）
            const toolInput = (node.toolId === 'web_search') ? originalInput : context
            step.input = toolInput
            const toolResult = await _callTool(node.toolId || 'web_search', toolInput)
            step.output = toolResult
            context = toolResult
          }

          step.status = 'done'
          step.endedAt = Date.now()
          onStep?.(step)
        }

        const run = getRun()
        run.output = context
        run.status = 'done'
        run.endedAt = Date.now()
        this.activeRunId = null
        this.isExecuting = false
        wf.lastRunAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        onDone?.(run)
        return run
      } catch (e) {
        const run = getRun()
        if (run) {
          run.status = 'failed'
          run.error = e.message
          run.endedAt = Date.now()
        }
        this.activeRunId = null
        this.isExecuting = false
        onError?.(e)
        return getRun()
      }
    },

    /**
     * 停止当前执行
     */
    stopWorkflow() {
      this.isExecuting = false
      // activeRunId 会在 startWorkflow 的循环检测到 isExecuting=false 后自然清理
    },

    /** 旧 API 兼容：execute = startWorkflow */
    async execute(input, opts = {}) {
      return this.startWorkflow(input, opts)
    },

    clearRuns() {
      this.runs = []
      this.activeRunId = null
      this.isExecuting = false
    }
  }
})

// ===== 辅助函数 =====
async function _chatOnceWithSystem({ systemPrompt, userContent, model, temperature }) {
  const settings = useSettingsStore()
  if (!settings.isConfigured) {
    const text = localFallback([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ])
    return text + '\n\n---\n⚠️ 本地演示模式（未配置 AI API Key），以上为模拟回复。请到「设置 → AI 服务」配置后启用真实 AI。'
  }
  return chatOnce({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.realModel(model),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature
  })
}

async function _callTool(toolId, input) {
  try {
    const { callTool: realCallTool } = await import('@/services/tools')
    return await realCallTool(toolId, input)
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    // 返回真实错误信息，而非伪装成功
    return `[工具「${toolId}」执行失败]\n错误：${e.message}\n\n输入：${(input || '').slice(0, 200)}`
  }
}
