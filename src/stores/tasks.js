import { defineStore } from 'pinia'
import { chatOnce, localFallback } from '@/services/ai'
import { useAgentStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'

/**
 * 任务 store —— 任务 = 智能体执行。
 *
 * 任务对象结构：
 *   id, title, agentId, agentName, input, status, output, progress,
 *   createdAt, trigger('manual'|'daily'|'weekly'), error?
 *
 * status: queued → running → done | failed
 *
 * 重构说明（P0-2）：
 *   - 补全 create / execute / cancel / retry / updateProgress action（从 TasksView 下沉）
 *   - 加任务队列：maxConcurrent 并发控制，queued 任务自动调度执行
 *   - 加 runLogs 联动：执行完成时同步记录到 agents store
 *   - 加定时调度：trigger=daily/weekly 的任务可被 scheduler 调用
 */

const MAX_CONCURRENT = 2

const seedTasks = [
  {
    id: 'tk-1',
    title: '生成 v2.3 PRD 大纲',
    agentId: 'a-1',
    agentName: '研究助理',
    input: '请为 v2.3 版本生成 PRD 大纲，聚焦首屏价值秒表与页面级权限。',
    status: 'done',
    output: '## v2.3 PRD 大纲\n\n**核心结论**\n1. 首屏"看见价值"时间需 ≤ 3 秒\n2. 权限粒度从全局细化到页面级\n3. 报告模板引擎支持自定义字段\n\n**证据强度**：高 / 中 / 中\n\n**待验证项**\n- 移动端只读同步延迟是否可接受\n- 自定义字段上限 32 是否放宽到 64',
    progress: 100,
    createdAt: '今天 10:32',
    trigger: 'manual'
  },
  {
    id: 'tk-2',
    title: '整理本周周报',
    agentId: 'a-6',
    agentName: '周报生成器',
    input: '本周完成：登录页重构、修复 4 个 bug、参加 2 次需求评审。下周计划：权限模块开发与接口联调。',
    status: 'done',
    output: '## 本周周报\n\n**概要**：本周聚焦登录页交付与稳定性提升，下周进入权限模块。\n\n**完成事项** ✅\n- 登录页重构完成，通过设计走查\n- 修复 4 个 P1/P2 bug\n- 完成 2 次需求评审，对齐 v2.3 范围\n\n**进行中** 🔄\n- 权限模块技术方案设计\n\n**下周计划**\n- 权限模块开发（页面级）\n- 接口联调\n\n**风险与求助**\n- 权限方案需后端本周确认字段定义',
    progress: 100,
    createdAt: '今天 10:18',
    trigger: 'weekly'
  },
  {
    id: 'tk-3',
    title: '审阅 PR #482 改动',
    agentId: 'a-2',
    agentName: '代码评审',
    input: '审阅 PR #482 的 diff，关注 SQL 注入与错误处理。',
    status: 'failed',
    error: 'API 429: 请求过于频繁，请稍后重试',
    progress: 100,
    createdAt: '今天 09:55',
    trigger: 'manual'
  },
  {
    id: 'tk-4',
    title: '改写日文商务邮件',
    agentId: 'a-3',
    agentName: '日文邮件',
    input: '把"关于下周演示会议的确认邮件"改写为商务日语。',
    status: 'done',
    output: '拝啓\n貴社におかれましては益々ご清栄のこととお慶び申し上げます。\n来週のデモ会議の件、ご確認ありがとうございます。\n日程は来週水曜 14:00 で確定とさせていただきます。\n敬語注解：\n• 「ご清栄」— 相手の繁栄を祝う定形表現\n• 「確定とさせていただきます」— 謙譲語 + 使役受身',
    progress: 100,
    createdAt: '昨天 16:20',
    trigger: 'manual'
  },
  {
    id: 'tk-5',
    title: '每日早报',
    agentId: 'a-1',
    agentName: '研究助理',
    input: '总结今日 AI 与产品领域的 3-5 条重要动态。',
    status: 'done',
    output: '**今日要点**\n1. 多智能体协作框架进入生产可用阶段\n2. 端侧模型推理速度提升 40%\n3. 欧盟 AI 法案实施细则公布\n4. 代码生成模型在基准测试中超越人类均值',
    progress: 100,
    createdAt: '昨天 08:00',
    trigger: 'daily'
  }
]

// 模块级：跟踪进行中的 AbortController 与进度定时器
const _abortControllers = new Map() // taskId -> AbortController
const _progressTimers = new Map()   // taskId -> intervalId

export const useTaskStore = defineStore('tasks', {
  state: () => ({
    // M13 修复：深拷贝种子数据
    list: JSON.parse(JSON.stringify(seedTasks)),
    filter: 'all',
    maxConcurrent: MAX_CONCURRENT
  }),
  persist: ['list', 'filter', 'maxConcurrent'],
  getters: {
    counts(state) {
      return {
        all:     state.list.length,
        running: state.list.filter(t => t.status === 'running').length,
        queued:  state.list.filter(t => t.status === 'queued').length,
        done:    state.list.filter(t => t.status === 'done').length,
        failed:  state.list.filter(t => t.status === 'failed').length
      }
    },
    visible(state) {
      if (state.filter === 'all') return state.list
      return state.list.filter(t => t.status === state.filter)
    },
    // 当前可执行的任务（queued 且未超过并发上限）
    _dispatchable(state) {
      const running = state.list.filter(t => t.status === 'running').length
      if (running >= state.maxConcurrent) return []
      return state.list.filter(t => t.status === 'queued')
        .slice(0, state.maxConcurrent - running)
    }
  },
  actions: {
    setFilter(f) { this.filter = f },
    remove(id) {
      const idx = this.list.findIndex(t => t.id === id)
      if (idx >= 0) this.list.splice(idx, 1)
    },

    // 批量清除已完成任务
    clearCompleted() {
      const before = this.list.length
      this.list = this.list.filter(t => t.status !== 'done')
      return before - this.list.length
    },

    // 批量清除失败任务
    clearFailed() {
      const before = this.list.length
      this.list = this.list.filter(t => t.status !== 'failed')
      return before - this.list.length
    },

    /**
     * 创建任务并自动加入队列执行
     * @param {Object} payload { title, agentId, input, trigger }
     * @param {Object} opts { autoExecute: true } 默认创建后自动执行
     * @returns {Object} 创建的任务
     */
    create(payload, opts = { autoExecute: true }) {
      const title = (payload.title || '').trim()
      const input = (payload.input || '').trim()
      if (!title) throw new Error('请输入任务标题')
      if (!input) throw new Error('请输入任务描述')
      if (!payload.agentId) throw new Error('请选择智能体')

      const agents = useAgentStore()
      const agent = agents.list.find(a => a.id === payload.agentId)
      const task = {
        id: 'tk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        title,
        agentId: payload.agentId,
        agentName: agent?.name || '—',
        input,
        status: 'queued',
        output: '',
        progress: 0,
        createdAt: new Date().toTimeString().slice(0, 5),
        createdAtTs: Date.now(),
        trigger: payload.trigger || 'manual'
      }
      this.list.unshift(task)
      if (opts.autoExecute !== false) {
        // 异步调度，不阻塞当前调用
        this._dispatch()
      }
      return task
    },

    /**
     * 执行任务（核心逻辑，从 TasksView.executeTask 下沉）
     * @param {string} taskId
     * @param {Object} opts { onDelta } 可选流式回调
     */
    async execute(taskId, opts = {}) {
      const task = this.list.find(t => t.id === taskId)
      if (!task) return
      if (task.status === 'running') return

      const agents = useAgentStore()
      const chat = useChatStore()
      const settings = useSettingsStore()

      task.status = 'running'
      task.progress = 10
      task.error = undefined
      task.output = ''
      task.agentName = agents.list.find(a => a.id === task.agentId)?.name || task.agentName

      // 进度推进（10 → 90）
      const timer = setInterval(() => {
        if (task.progress < 90) {
          task.progress = Math.min(90, task.progress + Math.random() * 8)
        }
      }, 600)
      _progressTimers.set(taskId, timer)

      // 新建 AbortController
      const ac = new AbortController()
      _abortControllers.set(taskId, ac)

      // 同步记录到 agents.runLogs（运行中状态）
      const runLog = agents.recordRun({
        agentId: task.agentId,
        agentName: task.agentName,
        title: task.title,
        status: 'running',
        trigger: task.trigger,
        progress: 0,
        output: ''
      })

      try {
        const agent = agents.list.find(a => a.id === task.agentId)
        const systemPrompt = agent?.systemPrompt || ''
        let result
        if (settings.isConfigured) {
          result = await chatOnce({
            baseUrl: settings.baseUrl,
            apiKey: settings.apiKey,
            model: settings.realModel(chat.model),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: task.input }
            ],
            temperature: agent?.temperature ?? 0.5,
            signal: ac.signal
          })
        } else {
          // 本地 fallback 不支持 abort，模拟延迟以便取消生效
          await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
          if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          result = localFallback([{ role: 'user', content: task.input }])
        }
        task.output = result
        task.status = 'done'
        task.progress = 100
        agents.updateRun(runLog.id, {
          status: 'done',
          progress: 100,
          output: result,
          endedAt: Date.now(),
          duration: (Date.now() - runLog.startedAt) / 1000,
          tokens: Math.ceil(result.length / 2.5)
        })
        opts.onSuccess?.(task)
      } catch (e) {
        if (e?.name === 'AbortError') {
          task.status = 'cancelled'
          task.progress = 0
          agents.updateRun(runLog.id, { status: 'failed', endedAt: Date.now(), output: '（已取消）' })
          opts.onCancel?.(task)
        } else {
          task.status = 'failed'
          task.error = e.message
          task.progress = 100
          agents.updateRun(runLog.id, {
            status: 'failed',
            endedAt: Date.now(),
            output: e.message,
            duration: (Date.now() - runLog.startedAt) / 1000
          })
          opts.onError?.(task, e)
        }
      } finally {
        clearInterval(timer)
        _progressTimers.delete(taskId)
        _abortControllers.delete(taskId)
        // 调度下一个排队任务
        this._dispatch()
      }
    },

    /**
     * 取消任务
     */
    cancel(taskId) {
      const task = this.list.find(t => t.id === taskId)
      if (!task) return
      if (task.status !== 'running' && task.status !== 'queued') return
      const ac = _abortControllers.get(taskId)
      if (ac) {
        // running: abort 后 execute 的 catch 会把状态置回 queued
        try { ac.abort() } catch {}
      } else {
        // queued: 尚未开始执行，直接移除
        this.remove(taskId)
      }
    },

    /**
     * 重试任务
     */
    retry(taskId) {
      const task = this.list.find(t => t.id === taskId)
      if (!task) return
      if (task.status === 'running') return
      this.execute(taskId)
    },

    /**
     * 调度队列：把 queued 的任务按并发上限派发执行
     */
    _dispatch() {
      const dispatchable = this._dispatchable
      for (const t of dispatchable) {
        // 不 await，让多个任务并行
        this.execute(t.id)
      }
    },

    /**
     * 组件卸载时清理所有进行中的任务（可选，保留后台执行）
     */
    cleanup() {
      _progressTimers.forEach(t => clearInterval(t))
      _progressTimers.clear()
      _abortControllers.forEach(ac => { try { ac.abort() } catch {} })
      _abortControllers.clear()
    }
  }
})
