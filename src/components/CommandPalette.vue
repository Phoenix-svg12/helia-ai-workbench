<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useAgentStore } from '@/stores/agents'
import { useTaskStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import { useRouter } from 'vue-router'
import { MODEL_OPTIONS } from '@/constants/models'
import Icon from '@/components/Icon.vue'

const ui = useUIStore()
const chat = useChatStore()
const agents = useAgentStore()
const tasks = useTaskStore()
const toast = useToastStore()
const router = useRouter()
const q = ref('')
const active = ref(0)
const input = ref(null)

// 动态构建命令项：包含页面跳转、智能体调用、任务操作、模型切换
const items = computed(() => {
  const list = [
    { type: '动作',  label: '新建对话',          hint: 'N',    icon: 'plus',    action: () => { chat.newThread(); router.push('/chat'); toast.push('已新建对话', 'success') } },
    { type: '动作',  label: '新建任务',          hint: '',     icon: 'list',    action: () => { router.push('/tasks'); toast.push('前往任务面板', 'info') } },
    { type: '页面',  label: '前往：对话',         hint: 'C',    icon: 'chat',    action: () => router.push('/chat') },
    { type: '页面',  label: '前往：智能体画布',   hint: 'A',    icon: 'spark',   action: () => router.push('/agents') },
    { type: '页面',  label: '前往：任务',         hint: 'T',    icon: 'list',    action: () => router.push('/tasks') },
    { type: '页面',  label: '前往：知识库',       hint: 'K',    icon: 'book',    action: () => router.push('/knowledge') },
    { type: '页面',  label: '前往：设置',         hint: ',',    icon: 'gear',    action: () => router.push('/settings') }
  ]
  // 动态加入智能体调用项
  agents.list.slice(0, 6).forEach((a, i) => {
    list.push({
      type: '智能体',
      label: `调用：${a.name}`,
      hint: `⌘${i + 1}`,
      icon: 'spark',
      action: () => { router.push('/agents'); agents.select(a.id); toast.push(`已选中 ${a.name}`, 'success') }
    })
  })
  // 模型切换
  MODEL_OPTIONS.forEach(m => {
    list.push({
      type: '工具', label: `切换模型为 ${m.label}`, hint: '', icon: 'cpu',
      action: () => { chat.model = m.id; toast.push(`已切换模型为 ${m.label}`, 'success') }
    })
  })
  // 最近任务快速跳转
  tasks.list.slice(0, 3).forEach(t => {
    list.push({
      type: '任务',
      label: `任务：${t.title}（${t.status}）`,
      hint: '',
      icon: 'list',
      action: () => { router.push('/tasks'); toast.push(`已跳转到任务`, 'info') }
    })
  })
  // 视图控制
  list.push(
    { type: '工具', label: '收起 / 展开右栏', hint: '', icon: 'grid', action: () => { ui.toggleRight() } },
    { type: '工具', label: '收起 / 展开侧栏', hint: '', icon: 'menu', action: () => { ui.toggleSidebar() } }
  )
  return list
})

const filtered = computed(() => {
  if (!q.value.trim()) return items.value
  const k = q.value.toLowerCase()
  return items.value.filter(i => i.label.toLowerCase().includes(k) || i.type.toLowerCase().includes(k))
})

function onKey(e) {
  if (!filtered.value.length) return
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % filtered.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + filtered.value.length) % filtered.value.length }
  else if (e.key === 'Enter')  { run(filtered.value[active.value]) }
}
function run(it) {
  if (!it) return
  it.action()
  ui.closeCommand()
}

onMounted(() => {
  setTimeout(() => input.value?.focus(), 30)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => q.value, () => { active.value = 0 })
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 animate-fadeIn">
    <div class="absolute inset-0 bg-[rgba(0,0,0,0.3)] backdrop-blur-sm" @click="ui.closeCommand()"></div>
    <div class="relative w-full max-w-xl rounded-2xl overflow-hidden animate-slideUp cmd-panel">
      <div class="flex items-center gap-3 px-4 h-12 cmd-border-b">
        <Icon name="search" :size="16" class="text-grey-500" />
        <input
          ref="input"
          v-model="q"
          placeholder="搜索对话、智能体、动作…"
          class="flex-1 bg-transparent outline-none text-[14px] text-grey-900 placeholder:text-grey-400"
        />
        <span class="kbd">esc</span>
      </div>

      <ul class="max-h-[50vh] overflow-y-auto py-2">
        <li v-if="!filtered.length" class="px-4 py-8 text-center text-[12.5px] text-grey-500">没有匹配的结果</li>
        <li
          v-for="(it, i) in filtered" :key="it.id || it.label + i"
          role="option"
          @mouseenter="active = i"
          @click="run(it)"
          :class="['flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors cmd-item',
                   active === i ? 'cmd-item-active' : '']"
        >
          <Icon :name="it.icon || 'spark'" :size="14" class="text-grey-500 shrink-0" />
          <span class="chip text-[10px] uppercase tracking-wider">{{ it.type }}</span>
          <span class="flex-1 text-[13px] text-grey-800">{{ it.label }}</span>
          <span v-if="it.hint" class="kbd">{{ it.hint }}</span>
        </li>
      </ul>

      <div class="px-4 py-2 flex items-center justify-between text-[10.5px] text-grey-400 cmd-border-t">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5"><span class="kbd">↑</span><span class="kbd">↓</span>选择</span>
          <span class="flex items-center gap-1.5"><span class="kbd">↵</span>运行</span>
        </div>
        <span>Helia · 智能工作台</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmd-panel {
  background: var(--bg-default);
  border: 1px solid var(--border-neutral-l1);
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
}
.cmd-border-b { border-bottom: 1px solid var(--border-neutral-l1); }
.cmd-border-t { border-top: 1px solid var(--border-neutral-l1); }
.cmd-item-active { background: var(--overlay-l1); }
.cmd-item:hover { background: rgba(115,115,115,0.06); }
</style>
