<script setup>
import { computed, ref, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useToastStore } from '@/stores/toast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const ui = useUIStore()
const toast = useToastStore()

// 重命名输入框 DOM 引用
const renameInputEl = ref(null)

const groups = computed(() => {
  const order = ['工作', '研究', '生活', '模板']
  // 先按固定顺序排列已知分组，再追加其他分组
  const known = order.map((g) => ({
    name: g,
    items: chat.threads.filter((t) => t.group === g)
  })).filter((g) => g.items.length)
  // 收集不在固定分组中的对话
  const knownSet = new Set(order)
  const others = chat.threads.filter((t) => !knownSet.has(t.group))
  if (others.length) {
    known.push({ name: '其他', items: others })
  }
  return known
})

const navItems = [
  { to: '/chat',      label: '对话',       hint: 'C',    icon: 'chat' },
  { to: '/agents',    label: '智能体',     hint: 'A',    icon: 'spark' },
  { to: '/tasks',     label: '任务',       hint: 'T',    icon: 'list' },
  { to: '/knowledge', label: '知识库',     hint: 'K',    icon: 'book' },
  { to: '/settings',  label: '设置',       hint: ',',    icon: 'gear' }
]

function isActive(to) {
  return route.path.startsWith(to)
}

function newChat() {
  chat.newThread()
  router.push('/chat')
  ui.closeMobileSidebar()
  toast.push('已新建对话', 'success')
}

// 删除前二次确认
const pendingDelete = ref(null)
const showDeleteConfirm = ref(false)
function askDelete(e, id) {
  e.stopPropagation()
  const t = chat.threads.find(x => x.id === id)
  pendingDelete.value = t || null
  showDeleteConfirm.value = true
}
function confirmDelete() {
  const t = pendingDelete.value
  if (!t) return
  const id = t.id
  chat.deleteThread(id)
  toast.push(`已删除「${t.title}」`, 'info')
  if (route.params.id === id) router.push('/chat')
  pendingDelete.value = null
}

// ===== 重命名对话 =====
const editingId = ref(null)
const editingTitle = ref('')

function startRename(e, t) {
  e.stopPropagation()
  editingId.value = t.id
  editingTitle.value = t.title
  // 在 DOM 更新后 focus + select，只执行一次
  nextTick(() => {
    renameInputEl.value?.focus()
    renameInputEl.value?.select()
  })
}

function commitRename() {
  if (!editingId.value) return
  const newTitle = editingTitle.value.trim()
  if (newTitle) {
    chat.renameThread(editingId.value, newTitle)
    toast.push('对话已重命名', 'success')
  }
  editingId.value = null
  editingTitle.value = ''
}

function cancelRename() {
  editingId.value = null
  editingTitle.value = ''
}

function onRenameKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitRename()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelRename()
  }
}
</script>

<template>
  <aside
    class="app-sidebar"
    :class="[
      ui.sidebarCollapsed ? 'w-[68px]' : 'w-[268px]',
      ui.mobileSidebarOpen
        ? 'flex fixed inset-y-0 left-0 shadow-dialog'
        : 'fixed inset-y-0 left-0 -translate-x-full md:translate-x-0'
    ]"
  >
    <!-- Brand -->
    <div class="h-14 flex items-center gap-2.5 px-3.5 hairline-b shrink-0">
      <div class="relative w-8 h-8 rounded-xl flex items-center justify-center bg-brand-600">
        <Icon name="cube" :size="16" class="text-white" />
      </div>
      <div v-if="!ui.sidebarCollapsed" class="flex flex-col leading-none">
        <span class="text-[13px] font-semibold tracking-tight text-brand-600">Helia</span>
        <span class="text-[10.5px] text-grey-500 mt-0.5">AI 智能工作台</span>
      </div>
      <button
        @click="ui.toggleSidebar"
        class="icon-btn ml-auto"
        :title="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        :aria-label="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
      >
        <Icon :name="ui.sidebarCollapsed ? 'chevR' : 'chevL'" :size="16" />
      </button>
    </div>

    <!-- Primary nav -->
    <nav class="px-2.5 py-3 space-y-0.5 shrink-0">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        @click="ui.closeMobileSidebar()"
        :class="[isActive(item.to) ? 'nav-item-active' : 'nav-item', 'group']"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <span class="w-4 h-4 inline-flex items-center justify-center shrink-0">
          <Icon :name="item.icon" :size="16" />
        </span>
        <span v-if="!ui.sidebarCollapsed" class="flex-1">{{ item.label }}</span>
        <span v-if="!ui.sidebarCollapsed" class="text-[10px] text-grey-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{{ item.hint }}</span>
      </RouterLink>
    </nav>

    <!-- New chat button -->
    <div class="px-2.5 pb-3 shrink-0">
      <button
        @click="newChat"
        class="w-full btn-outline justify-center"
        :class="ui.sidebarCollapsed ? 'px-0' : ''"
        title="新建对话 · N"
      >
        <Icon name="plus" :size="14" />
        <span v-if="!ui.sidebarCollapsed">新建对话</span>
      </button>
    </div>

    <!-- Thread list -->
    <div v-if="!ui.sidebarCollapsed" class="flex-1 min-h-0 overflow-y-auto px-2.5 pb-3 space-y-3">
      <div v-for="g in groups" :key="g.name">
        <div class="flex items-center justify-between px-2 mb-1.5">
          <span class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium">{{ g.name }}</span>
          <span class="text-[10.5px] text-grey-400 font-mono">{{ g.items.length }}</span>
        </div>
        <ul class="space-y-0.5">
          <li v-for="t in g.items" :key="t.id" class="group/thread">
            <div
              role="button"
              tabindex="0"
              @click="chat.setActive(t.id); router.push('/chat/' + t.id); ui.closeMobileSidebar()"
              @keydown.enter.prevent="chat.setActive(t.id); router.push('/chat/' + t.id); ui.closeMobileSidebar()"
              @keydown.space.prevent="chat.setActive(t.id); router.push('/chat/' + t.id); ui.closeMobileSidebar()"
              @dblclick="(e) => startRename(e, t)"
              :aria-current="chat.activeId === t.id ? 'true' : undefined"
              :class="['w-full text-left px-2.5 py-2 rounded-lg transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2',
                       chat.activeId === t.id ? 'bg-brand-600/8 text-grey-900' : 'text-grey-600 hover:text-grey-900 hover:bg-grey-100']"
            >
              <div class="flex items-center gap-2">
                <span v-if="t.pinned" class="text-brand-600" aria-hidden="true">
                  <Icon name="pin" :size="12" />
                </span>
                <!-- 重命名编辑模式 -->
                <input
                  v-if="editingId === t.id"
                  ref="renameInputEl"
                  v-model="editingTitle"
                  @click.stop
                  @keydown="onRenameKeydown"
                  @blur="commitRename"
                  class="flex-1 min-w-0 px-1 py-0.5 text-[12.5px] font-medium bg-[var(--bg-default)] border border-brand-600/40 rounded outline-none focus:ring-2 focus:ring-brand-600/15 text-[var(--text-default)]"
                />
                <span v-else class="flex-1 truncate text-[12.5px] font-medium leading-tight">{{ t.title }}</span>
                <span v-if="t.unread" class="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-brand-600/15 text-brand-600" :aria-label="`${t.unread} 条未读`">{{ t.unread }}</span>
                <!-- 操作按钮：重命名 + 删除 -->
                <template v-if="editingId !== t.id">
                  <button
                    @click="(e) => startRename(e, t)"
                    :class="['text-grey-400 hover:text-brand-600 transition-opacity shrink-0 focus-visible:opacity-100',
                             chat.activeId === t.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']"
                    title="重命名"
                    :aria-label="`重命名 ${t.title}`"
                  >
                    <Icon name="edit" :size="12" />
                  </button>
                  <button
                    @click="(e) => askDelete(e, t.id)"
                    @keydown.enter.stop.prevent="(e) => askDelete(e, t.id)"
                    :class="['text-grey-400 hover:text-error transition-opacity shrink-0 focus-visible:opacity-100',
                             chat.activeId === t.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']"
                    title="删除对话"
                    :aria-label="`删除对话 ${t.title}`"
                  >
                    <Icon name="trash" :size="12" />
                  </button>
                </template>
              </div>
              <div class="mt-1 flex items-center justify-between text-[10.5px] text-grey-400">
                <span class="truncate">{{ t.preview || '—' }}</span>
                <span class="ml-2 shrink-0 font-mono">{{ t.updated }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
    <div v-else class="flex-1 min-h-0"></div>

    <!-- User -->
    <div class="hairline-t p-2.5 shrink-0">
      <div v-if="!ui.sidebarCollapsed" class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-grey-100">
        <div class="w-7 h-7 rounded-lg text-white font-semibold text-[12px] flex items-center justify-center bg-brand-600">
          {{ ui.user.avatar }}
        </div>
        <div class="min-w-0 leading-tight">
          <div class="text-[12.5px] text-grey-800 font-medium truncate">{{ ui.user.name }}</div>
          <div class="text-[10.5px] text-grey-500 truncate">{{ ui.user.plan }}</div>
        </div>
        <span class="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-brand-600 animate-pulseDot" title="在线"></span>
      </div>
      <div v-else class="flex justify-center">
        <div class="w-7 h-7 rounded-lg text-white font-semibold text-[12px] flex items-center justify-center bg-brand-600">{{ ui.user.avatar }}</div>
      </div>
    </div>

    <!-- 删除确认 -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      :title="`删除对话「${pendingDelete?.title || ''}」？`"
      desc="删除后无法恢复，且会从所有已同步设备移除。"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
    />
  </aside>
</template>

<style scoped>
.app-sidebar {
  flex-direction: column;
  backdrop-filter: blur(8px);
  border-right: 1px solid var(--border-neutral-l1);
  transition: width 0.2s ease-out;
  z-index: 40;
  background: var(--bg-default);
}
@media (min-width: 768px) {
  .app-sidebar {
    display: flex;
    position: static;
    z-index: 2;
  }
}
</style>
