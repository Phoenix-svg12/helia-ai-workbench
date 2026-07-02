import { defineStore } from 'pinia'

/**
 * UI store —— 全局 UI 状态
 *
 * 重构说明：
 *   - user 信息保留默认值，但建议从外部读取（未来可接登录态）
 *   - notifications 改为派生：从 tasks/agents 真实事件生成（替代 AppTopbar 硬编码假数据）
 */
export const useUIStore = defineStore('ui', {
  state: () => ({
    sidebarCollapsed: false,
    rightPanelOpen: true,
    commandOpen: false,
    mobileSidebarOpen: false,
    theme: 'light',
    user: {
      name: '林清和',
      handle: '@lin',
      plan: 'Pro · 本地优先',
      avatar: 'L'
    },
    status: 'online',
    // 已读通知的 id 集合（用于 AppTopbar 标记已读）
    readNotificationIds: [],
    // 通用偏好设置（设置页表单绑定）
    preferences: {
      workspaceName: 'Helia · 个人工作台',
      language: 'zh-CN',
      autoTitle: true,
      streamReply: true,
      reducedMotion: false
    }
  }),
  persist: ['sidebarCollapsed', 'rightPanelOpen', 'theme', 'user', 'status', 'readNotificationIds', 'preferences'],
  getters: {
    // 真实通知：从 tasks store 派生（最近 5 条非 queued 任务事件）
    // 注意：此处不直接引用 tasks store 避免循环依赖，由 AppTopbar 组合时注入
  },
  actions: {
    toggleSidebar() { this.sidebarCollapsed = !this.sidebarCollapsed },
    toggleRight() { this.rightPanelOpen = !this.rightPanelOpen },
    toggleMobileSidebar() {
      this.mobileSidebarOpen = !this.mobileSidebarOpen
      if (this.mobileSidebarOpen) this.sidebarCollapsed = false
    },
    closeMobileSidebar() { this.mobileSidebarOpen = false },
    openCommand() { this.commandOpen = true },
    closeCommand() { this.commandOpen = false },
    markNotificationRead(id) {
      if (!this.readNotificationIds.includes(id)) {
        this.readNotificationIds.push(id)
        // 限制长度
        if (this.readNotificationIds.length > 100) {
          this.readNotificationIds = this.readNotificationIds.slice(-100)
        }
      }
    },
    markAllNotificationsRead(ids) {
      ids.forEach(id => {
        if (!this.readNotificationIds.includes(id)) {
          this.readNotificationIds.push(id)
        }
      })
      if (this.readNotificationIds.length > 100) {
        this.readNotificationIds = this.readNotificationIds.slice(-100)
      }
    },
    isNotificationRead(id) {
      return this.readNotificationIds.includes(id)
    },

    // ===== 主题管理 =====
    /** 应用主题到 DOM（在 store 初始化和切换时调用） */
    applyTheme() {
      const isDark = this.theme === 'dark'
      document.documentElement.classList.toggle('dark', isDark)
    },
    setTheme(theme) {
      this.theme = theme
      this.applyTheme()
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      this.applyTheme()
    },
    get isDark() { return this.theme === 'dark' },

    // ===== 语言管理 =====
    setLanguage(lang) {
      this.preferences.language = lang
    }
  }
})
