import { defineStore } from 'pinia'

let _id = 0
const _timers = new Map() // id -> timerId，便于 clearAll 时统一清理

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [],
    // 历史记录（可选展示），最近 50 条
    history: []
  }),
  actions: {
    /**
     * 推送 toast
     * @param {string} message
     * @param {string} type 'info' | 'success' | 'warn' | 'error'
     * @param {number} duration 毫秒，默认 2600
     */
    push(message, type = 'info', duration = 2600) {
      const id = 'toast-' + (++_id)
      this.items.push({ id, message, type })
      // 同步进历史
      this.history.unshift({ id, message, type, ts: Date.now() })
      if (this.history.length > 50) this.history = this.history.slice(0, 50)
      const timer = setTimeout(() => this.dismiss(id), duration)
      _timers.set(id, timer)
    },
    dismiss(id) {
      const idx = this.items.findIndex((t) => t.id === id)
      if (idx >= 0) this.items.splice(idx, 1)
      const timer = _timers.get(id)
      if (timer) { clearTimeout(timer); _timers.delete(id) }
    },
    /** 清空所有当前 toast（不影响 history） */
    clearAll() {
      _timers.forEach(t => clearTimeout(t))
      _timers.clear()
      this.items = []
    },
    /** 清空历史 */
    clearHistory() {
      this.history = []
    }
  }
})
