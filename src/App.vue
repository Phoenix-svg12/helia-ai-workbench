<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import { useRouter } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import AppRightPanel from '@/components/AppRightPanel.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import AppToast from '@/components/AppToast.vue'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useToastStore } from '@/stores/toast'
import { useSettingsStore } from '@/stores/settings'
import { MODEL_OPTIONS } from '@/constants/models'

const ui = useUIStore()
const chat = useChatStore()
const toast = useToastStore()
const settings = useSettingsStore()
const router = useRouter()

function onKey(e) {
  const mod = e.metaKey || e.ctrlKey
  // ⌘K — 命令面板
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.openCommand()
    return
  }
  // Escape — 关闭弹层
  if (e.key === 'Escape') {
    ui.closeCommand()
    return
  }
  // 以下快捷键仅在非输入框内生效
  const tag = (e.target?.tagName || '').toLowerCase()
  const isInput = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
  if (isInput) return

  // ⌘N — 新建对话
  if (mod && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    chat.newThread()
    router.push('/chat')
    toast.push('已新建对话', 'success')
    return
  }
  // ⌘⇧M — 切换模型
  if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
    e.preventDefault()
    const models = MODEL_OPTIONS.map(m => m.id)
    const idx = models.indexOf(chat.model)
    chat.model = models[(idx + 1) % models.length]
    toast.push(`已切换模型为 ${chat.model}`, 'success')
    return
  }
  // ⌘, — 打开设置
  if (mod && e.key === ',') {
    e.preventDefault()
    router.push('/settings')
    return
  }
  // 单键快捷：页面跳转（仅在非输入框）
  if (!mod && !e.shiftKey && !e.altKey) {
    const map = { c: '/chat', a: '/agents', t: '/tasks', k: '/knowledge' }
    const dest = map[e.key.toLowerCase()]
    if (dest) {
      e.preventDefault()
      router.push(dest)
    }
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  // 应用保存的主题
  ui.applyTheme()
  // 初始化多 Provider 配置（含旧数据迁移）
  settings.initProviders()
  // 窄屏下默认关闭右面板，避免遮罩覆盖内容
  if (window.innerWidth < 1024 && ui.rightPanelOpen) {
    ui.rightPanelOpen = false
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="h-full w-full flex text-grey-800 relative overflow-hidden" :style="{ background: ui.theme === 'dark' ? '#0A0A0A' : '#FFFFFF' }">
    <AppSidebar />
    <!-- 移动端侧栏遮罩 -->
    <transition name="page">
      <div
        v-if="ui.mobileSidebarOpen"
        class="md:hidden fixed inset-0 z-30 bg-[rgba(0,0,0,0.3)] backdrop-blur-sm"
        @click="ui.closeMobileSidebar()"
      ></div>
    </transition>
    <main class="flex-1 min-w-0 flex flex-col relative z-[1]">
      <AppTopbar />
      <div class="flex-1 min-h-0 flex">
        <section class="flex-1 min-w-0 overflow-hidden">
          <RouterView v-slot="{ Component, route }">
            <transition name="page" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
          </RouterView>
        </section>
        <AppRightPanel v-if="ui.rightPanelOpen" />
        <!-- 移动端右面板遮罩 -->
        <transition name="page">
          <div
            v-if="ui.rightPanelOpen"
            class="lg:hidden fixed inset-0 z-30 bg-[rgba(0,0,0,0.3)] backdrop-blur-sm"
            @click="ui.toggleRight()"
          ></div>
        </transition>
      </div>
    </main>
    <CommandPalette v-if="ui.commandOpen" />
    <AppToast />
  </div>
</template>

<style>
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-enter-to   { opacity: 1; transform: translateY(0); }
.page-leave-from { opacity: 1; transform: translateY(0); }
.page-leave-to   { opacity: 0; transform: translateY(-4px); }
.page-enter-active, .page-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}
</style>
