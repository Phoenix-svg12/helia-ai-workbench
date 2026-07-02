<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useToastStore } from '@/stores/toast'
import { useTaskStore } from '@/stores/tasks'
import { useAgentStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const ui = useUIStore()
const chat = useChatStore()
const toast = useToastStore()
const tasks = useTaskStore()
const agents = useAgentStore()
const settings = useSettingsStore()
const title = computed(() => route.meta?.title || 'Helia')

const modelMenuOpen = ref(false)
function toggleMenu() { modelMenuOpen.value = !modelMenuOpen.value }
function closeMenu() { modelMenuOpen.value = false }

// 当前激活 Provider 的真实模型名
const currentRealModel = computed(() => {
  return settings.selectedModel || settings.realModel(chat.model)
})

// 当前 Provider 名称
const activeProviderName = computed(() => {
  return settings.activeProvider?.name || '未配置'
})

// 当前 Provider 连接状态
const providerConnected = computed(() => settings.connected)

// 当前 Provider 所有可用模型（预设 + API获取 + 自定义）
const modelList = computed(() => settings.allModels)

// 哪些模型是自定义/本地的
function isCustomModel(modelId) {
  const p = settings.activeProvider
  return p?.customModels?.includes(modelId) || false
}

// 正在获取模型列表
const fetchingModels = ref(false)

async function refreshModels() {
  if (!settings.baseUrl) {
    toast.push('请先在设置中配置 Base URL', 'warn')
    return
  }
  fetchingModels.value = true
  toast.push('正在获取模型列表…', 'info')
  const result = await settings.fetchProviderModels(settings.activeProviderId)
  fetchingModels.value = false
  if (result.ok) {
    toast.push(`已获取 ${result.count} 个模型`, 'success')
  } else {
    toast.push(`获取失败：${result.error}`, 'error')
  }
}

function pickModel(modelId) {
  settings.setSelectedModel(modelId)
  modelMenuOpen.value = false
  toast.push(`已切换到 ${modelId}`, 'success')
}

function switchProvider(id) {
  settings.setActiveProvider(id)
  toast.push(`已切换到 ${settings.activeProvider?.name}`, 'success')
}

function gotoSettings() {
  modelMenuOpen.value = false
  router.push('/settings')
}

function newTask() {
  router.push('/tasks')
  toast.push('前往任务面板创建新任务', 'info')
}

// 真实通知：从 tasks store 的最近运行记录派生
const notifications = computed(() => {
  const recent = tasks.list
    .filter(t => t.status !== 'queued')
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      text: t.status === 'done'
        ? `任务「${t.title}」已完成`
        : t.status === 'failed'
        ? `任务「${t.title}」失败：${t.error || '未知错误'}`
        : `任务「${t.title}」运行中 ${Math.round(t.progress || 0)}%`,
      meta: `${t.agentName} · ${t.createdAt}`,
      read: ui.isNotificationRead(t.id)
    }))
  const agentRuns = agents.recentRuns.slice(0, 3).map(r => ({
    id: r.id,
    text: r.status === '成功'
      ? `智能体「${r.agent}」调用成功`
      : r.status === '失败'
      ? `智能体「${r.agent}」调用失败`
      : `智能体「${r.agent}」运行中`,
    meta: `${r.trigger} · ${r.when} · ${r.dur}`,
    read: ui.isNotificationRead(r.id)
  }))
  return [...recent, ...agentRuns].slice(0, 8)
})

const hasUnread = computed(() => notifications.value.some(n => !n.read))

const notifOpen = ref(false)
function toggleNotif() {
  notifOpen.value = !notifOpen.value
}
function closeNotif() {
  notifOpen.value = false
}
function closeNotifAndRead() {
  const ids = notifications.value.map(n => n.id)
  ui.markAllNotificationsRead(ids)
  notifOpen.value = false
  toast.push('已全部标记为已读', 'success')
}
function clickNotif(n) {
  ui.markNotificationRead(n.id)
  if (n.id.startsWith('tk-')) {
    router.push('/tasks')
  } else {
    router.push('/agents')
  }
  closeNotif()
}
</script>

<template>
  <header class="h-14 shrink-0 flex items-center px-4 gap-3 z-10 app-topbar">
    <!-- 移动端侧栏开关 -->
    <button
      class="icon-btn md:hidden"
      title="菜单"
      aria-label="打开菜单"
      @click="ui.toggleMobileSidebar()"
    >
      <Icon name="menu" :size="16" />
    </button>

    <!-- breadcrumb -->
    <div class="flex items-center gap-2 text-[12.5px] text-grey-600">
      <span class="text-grey-400">Helia</span>
      <Icon name="chevR" :size="12" class="text-grey-400" />
      <span class="text-grey-900 font-medium">{{ title }}</span>
      <span v-if="route.path.startsWith('/chat') && chat.activeThread" class="text-grey-400 hidden md:inline">
        <span class="px-1.5">/</span>{{ chat.activeThread.title }}
      </span>
    </div>

    <!-- Search trigger -->
    <button
      @click="ui.openCommand()"
      class="topbar-search ml-3 hidden md:flex items-center gap-2 h-8 px-3 rounded-md text-[12.5px] transition-colors min-w-[260px]"
    >
      <Icon name="search" :size="14" />
      <span>搜索对话、智能体、文件…</span>
      <span class="ml-auto kbd">⌘K</span>
    </button>

    <div class="ml-auto flex items-center gap-1.5">
      <!-- Model & Provider selector -->
      <div class="relative" v-click-outside="closeMenu">
        <button
          @click="toggleMenu"
          class="topbar-model-btn flex items-center gap-2 rounded-md text-[12.5px] transition-colors"
          :aria-expanded="modelMenuOpen"
          aria-haspopup="menu"
          aria-label="选择模型"
        >
          <span class="w-1.5 h-1.5 rounded-full animate-pulseDot" :class="providerConnected === true ? 'bg-green-500' : providerConnected === false ? 'bg-red-400' : 'bg-brand-600'"></span>
          <span class="text-[12.5px] hidden sm:inline max-w-[100px] truncate">{{ activeProviderName }}</span>
          <span class="text-grey-400 hidden sm:inline">·</span>
          <span class="text-[12.5px] max-w-[140px] truncate">{{ currentRealModel || '未选择模型' }}</span>
          <Icon name="arrowDown" :size="12" class="text-grey-500" />
        </button>
        <transition name="page">
          <div v-if="modelMenuOpen" class="absolute right-0 top-full mt-1.5 w-80 rounded-xl p-1.5 z-20 app-dropdown max-h-[420px] overflow-y-auto">
            <!-- Provider 切换区 -->
            <div v-if="settings.providers.length > 1" class="mb-1">
              <div class="px-2.5 py-1 text-[10px] uppercase tracking-wider text-grey-400 font-medium">Provider</div>
              <button
                v-for="p in settings.providers" :key="p.id"
                @click="switchProvider(p.id)"
                :class="['w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors',
                         p.id === settings.activeProviderId ? 'bg-grey-100' : 'hover:bg-grey-100']"
              >
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full" :class="p.id === settings.activeProviderId ? 'bg-brand-600' : 'bg-grey-300'"></span>
                  <span class="text-[12px] text-grey-900 font-medium">{{ p.name }}</span>
                  <span v-if="p.connected === true" class="text-[9px] text-success">●</span>
                  <span v-else-if="p.connected === false" class="text-[9px] text-error">●</span>
                </span>
                <span class="text-[10px] text-grey-400">{{ (p.models?.length || 0) + (p.customModels?.length || 0) }} 模型</span>
              </button>
              <div class="my-1 app-dropdown-divider"></div>
            </div>

            <!-- 模型列表 -->
            <div class="flex items-center justify-between px-2.5 py-1">
              <span class="text-[10px] uppercase tracking-wider text-grey-400 font-medium">模型列表</span>
              <button
                @click="refreshModels"
                :disabled="fetchingModels"
                class="text-[10px] text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                title="从 API 获取可用模型"
              >
                <Icon :name="fetchingModels ? 'loading' : 'refresh'" :size="11" />
                {{ fetchingModels ? '获取中…' : '刷新模型' }}
              </button>
            </div>

            <!-- 真实模型列表 -->
            <div v-if="modelList.length > 0">
              <button
                v-for="m in modelList" :key="m"
                @click="pickModel(m)"
                :class="['w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-colors',
                         settings.selectedModel === m ? 'bg-grey-100' : 'hover:bg-grey-100']"
              >
                <span class="flex items-center gap-2.5 min-w-0">
                  <span class="w-2 h-2 rounded-full shrink-0" :class="isCustomModel(m) ? 'bg-orange-400' : 'bg-brand-500/60'"></span>
                  <div class="min-w-0">
                    <div class="text-[12.5px] text-grey-900 font-medium font-mono truncate">{{ m }}</div>
                    <div class="text-[10px] text-grey-400">{{ isCustomModel(m) ? '自定义/本地模型' : 'API 模型' }}</div>
                  </div>
                </span>
                <span v-if="settings.selectedModel === m" class="text-brand-600 shrink-0 ml-2">
                  <Icon name="check" :size="14" />
                </span>
              </button>
            </div>

            <!-- 空状态 -->
            <div v-else class="px-2.5 py-6 text-center">
              <div class="text-[12px] text-grey-400 mb-2">暂无可用模型</div>
              <button @click="refreshModels" class="text-[11px] text-brand-600 hover:underline">
                点击获取模型列表
              </button>
            </div>

            <!-- 底部操作 -->
            <div class="my-1 pt-1 app-dropdown-divider">
              <button @click="gotoSettings" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] text-grey-600 hover:bg-grey-100 transition-colors">
                <Icon name="gear" :size="13" />
                管理 Provider / 模型 / API Key
              </button>
            </div>
          </div>
        </transition>
      </div>

      <!-- 主题切换 -->
      <button
        class="icon-btn"
        :title="ui.theme === 'dark' ? '切换到亮色' : '切换到暗色'"
        :aria-label="ui.theme === 'dark' ? '切换到亮色' : '切换到暗色'"
        @click="ui.toggleTheme()"
      >
        <Icon :name="ui.theme === 'dark' ? 'sun' : 'moon'" :size="16" />
      </button>

      <button class="icon-btn" title="新建任务" aria-label="新建任务" @click="newTask">
        <Icon name="plus" :size="16" />
      </button>
      <!-- Notifications -->
      <div class="relative hidden sm:block" v-click-outside="closeNotif">
        <button class="icon-btn relative" title="通知" aria-label="通知" @click="toggleNotif" :aria-expanded="notifOpen" aria-haspopup="menu">
          <Icon name="bell" :size="16" />
          <span v-if="hasUnread" class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-600"></span>
        </button>
        <transition name="page">
          <div v-if="notifOpen" class="absolute right-0 top-full mt-1.5 w-72 rounded-xl p-1.5 z-20 app-dropdown">
            <div class="px-2.5 py-1.5 flex items-center justify-between">
              <span class="text-[12px] text-grey-900 font-medium">通知</span>
              <button v-if="hasUnread" @click="closeNotifAndRead" class="text-[10.5px] text-grey-500 hover:text-grey-700">全部已读</button>
            </div>
            <div class="app-dropdown-divider">
              <div v-if="!notifications.length" class="px-2.5 py-6 text-center text-[12px] text-grey-400">
                暂无通知
              </div>
              <div
                v-for="n in notifications" :key="n.id"
                class="px-2.5 py-2 hover:bg-grey-100 rounded-md cursor-pointer"
                :class="!n.read ? 'border-l-2 !border-l-brand-600' : ''"
                @click="clickNotif(n)"
              >
                <div class="text-[12px] text-grey-900">{{ n.text }}</div>
                <div class="text-[10.5px] text-grey-400 mt-0.5">{{ n.meta }}</div>
              </div>
            </div>
          </div>
        </transition>
      </div>
      <button
        @click="ui.toggleRight"
        class="icon-btn hidden lg:flex"
        :title="ui.rightPanelOpen ? '收起右栏' : '展开右栏'"
        :aria-label="ui.rightPanelOpen ? '收起右栏' : '展开右栏'"
      >
        <Icon name="grid" :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-topbar {
  background: var(--bg-default);
  border-bottom: 1px solid var(--border-neutral-l1);
}
.topbar-search {
  border: 1px solid var(--border-neutral-l1);
  color: var(--text-tertiary);
  background: transparent;
}
.topbar-search:hover {
  color: var(--text-secondary);
  border-color: rgba(115,115,115,0.18);
}
.topbar-model-btn {
  background: var(--overlay-l1);
  border: 1px solid var(--border-neutral-l1);
  padding: 6px 10px;
}
.app-dropdown {
  background: var(--bg-default);
  border: 1px solid var(--border-neutral-l1);
  box-shadow: 0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
}
.app-dropdown-divider {
  border-top: 1px solid var(--border-neutral-l1);
}
</style>
