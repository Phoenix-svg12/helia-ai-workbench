<script setup>
import { computed, ref, onMounted } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import { useAgentStore } from '@/stores/agents'
import BaseModal from '@/components/BaseModal.vue'
import Icon from '@/components/Icon.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'

const tasks = useTaskStore()
const toast = useToastStore()
const agents = useAgentStore()

/* ---------- 加载状态 ---------- */
const loading = ref(true)
onMounted(() => {
  setTimeout(() => { loading.value = false }, 400)
})

const filters = [
  { id: 'all',     label: '全部' },
  { id: 'running', label: '进行中' },
  { id: 'queued',  label: '排队' },
  { id: 'done',    label: '已完成' },
  { id: 'failed',  label: '失败' }
]

const statusMeta = {
  running: { label: '运行中', chip: 'chip-accent', dot: 'bg-brand-600 animate-pulseDot' },
  queued:  { label: '排队',   chip: '',            dot: 'bg-grey-400' },
  done:    { label: '完成',   chip: '',            dot: 'bg-success/60' },
  failed:  { label: '失败',   chip: 'chip-warn',   dot: 'bg-warning' },
  cancelled: { label: '已取消', chip: '',          dot: 'bg-grey-400' }
}
function getStatusMeta(status) {
  return statusMeta[status] || { label: status || '未知', chip: '', dot: 'bg-grey-400' }
}

const triggerMeta = {
  manual: { label: '手动', chip: '' },
  daily:  { label: '每日', chip: 'chip-accent' },
  weekly: { label: '每周', chip: 'chip-accent' }
}
function getTriggerMeta(trigger) {
  return triggerMeta[trigger] || { label: trigger || '—', chip: '' }
}

// 任务模板
const templates = [
  {
    id: 'daily-brief',
    title: '每日早报',
    desc: '用研究助理总结今日要点',
    agentId: 'a-1',
    input: '请帮我生成今日早报：总结 AI 与产品领域的 3-5 条重要动态，每条不超过 30 字，并标注影响范围。',
    trigger: 'daily'
  },
  {
    id: 'weekly-report',
    title: '周报生成',
    desc: '用周报生成器生成本周周报',
    agentId: 'a-6',
    input: '请帮我生成本周周报：完成了登录页重构、修复 4 个 bug、参加 2 次需求评审。下周计划：权限模块开发与接口联调。',
    trigger: 'weekly'
  },
  {
    id: 'code-review',
    title: '代码评审',
    desc: '用代码评审智能体检查代码',
    agentId: 'a-2',
    input: '请评审以下代码片段，关注错误处理、安全性与可读性：\n\nfunction getUser(id) {\n  return fetch(`/api/users/${id}`).then(r => r.json())\n}',
    trigger: 'manual'
  },
  {
    id: 'brainstorm',
    title: '头脑风暴',
    desc: '用头脑风暴智能体产出创意',
    agentId: 'a-7',
    input: '请为一个面向开发者的笔记应用头脑风暴 10 个提升用户留存的产品功能，每个功能给可行性评分（1-5）。',
    trigger: 'manual'
  }
]

const successRate = computed(() => {
  const done = tasks.list.filter(t => t.status === 'done').length
  const total = tasks.list.length || 1
  return Math.round((done / total) * 100)
})

const agentOptions = computed(() => agents.list)

// === 新建任务弹窗状态 ===
const showNewTaskModal = ref(false)
const newTaskTitle = ref('')
const newTaskAgentId = ref('a-1')
const newTaskInput = ref('')
const newTaskTrigger = ref('manual')

const viewMode = ref('table')
const expandedId = ref(null)

function agentName(id) {
  const a = agents.list.find(x => x.id === id)
  return a?.name || '—'
}

// === 任务执行：全部下沉到 tasks store（P0-5 重构）===
// View 层只负责调用 store action + 提示 toast

function createTask() {
  try {
    tasks.create({
      title: newTaskTitle.value,
      agentId: newTaskAgentId.value,
      input: newTaskInput.value,
      trigger: newTaskTrigger.value
    })
    showNewTaskModal.value = false
    resetForm()
    toast.push('任务已创建，开始执行', 'success')
  } catch (e) {
    toast.push(e.message, 'warn')
  }
}

function resetForm() {
  newTaskTitle.value = ''
  newTaskAgentId.value = agents.list[0]?.id || 'a-1'
  newTaskInput.value = ''
  newTaskTrigger.value = 'manual'
}

function applyTemplate(tpl) {
  newTaskTitle.value = tpl.title
  newTaskAgentId.value = tpl.agentId
  newTaskInput.value = tpl.input
  newTaskTrigger.value = tpl.trigger
  showNewTaskModal.value = true
}

function cancelTask(task) {
  tasks.cancel(task.id)
  toast.push(`任务「${task.title}」已取消`, 'info')
}

function retryTask(task) {
  if (task.status === 'running') {
    toast.push('任务正在运行中', 'warn')
    return
  }
  toast.push(`正在重新运行「${task.title}」`, 'info')
  tasks.retry(task.id)
}

function removeTask(task) {
  if (task.status === 'running') {
    toast.push('请先取消运行中的任务', 'warn')
    return
  }
  tasks.remove(task.id)
  toast.push('任务已删除', 'info')
}

function clearCompletedTasks() {
  const count = tasks.clearCompleted()
  if (count > 0) {
    toast.push(`已清除 ${count} 个已完成任务`, 'success')
  } else {
    toast.push('没有已完成任务可清除', 'info')
  }
}

function clearFailedTasks() {
  const count = tasks.clearFailed()
  if (count > 0) {
    toast.push(`已清除 ${count} 个失败任务`, 'success')
  } else {
    toast.push('没有失败任务可清除', 'info')
  }
}

async function copyOutput(task) {
  if (!task.output) {
    toast.push('暂无输出可复制', 'warn')
    return
  }
  try {
    await navigator.clipboard.writeText(task.output)
    toast.push('已复制到剪贴板', 'success')
  } catch {
    toast.push('复制失败，请手动选择文本', 'error')
  }
}

function toggleExpand(task) {
  if (task.status !== 'done' && task.status !== 'failed') return
  expandedId.value = expandedId.value === task.id ? null : task.id
}

function toggleView() {
  viewMode.value = viewMode.value === 'table' ? 'card' : 'table'
  toast.push(viewMode.value === 'table' ? '已切换到列表视图' : '已切换到卡片视图', 'info')
}

// Esc 关闭弹窗由 BaseModal 统一处理，无需手写

// 一次性数据迁移：把旧结构任务归一化到新结构（仅执行一次）
let _migrated = false
function migrateOnce() {
  if (_migrated) return
  _migrated = true
  for (const t of tasks.list) {
    if (!t.agentId && t.agent) {
      const a = agents.list.find(x => x.name === t.agent)
      t.agentId = a?.id || ''
      t.agentName = t.agent
    }
    if (t.agentId && !t.agentName) t.agentName = agentName(t.agentId)
    if (!('trigger' in t)) t.trigger = 'manual'
    if (!('input' in t)) t.input = ''
    if (!('output' in t)) t.output = ''
    if (!('createdAt' in t)) t.createdAt = t.startedAt || ''
    // 旧的假进度条 running/queued 无法继续，标为失败让用户重试
    if (t.status === 'running' || t.status === 'queued') {
      t.status = 'failed'
      t.error = t.error || '任务已重置，请重新运行'
      t.progress = 100
    }
  }
}
migrateOnce()
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-6 pt-5 pb-4 shrink-0">
      <div class="flex items-end justify-between gap-3 mb-4">
        <div>
          <h1 class="text-[22px] md:text-[24px] font-semibold tracking-tight text-grey-900">任务</h1>
          <p class="text-[12.5px] text-grey-500 mt-1">每个任务绑定一个智能体，创建后真实调用 AI 执行。</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-outline" @click="toggleView" :title="viewMode === 'table' ? '切换到卡片视图' : '切换到列表视图'">
            <Icon v-if="viewMode === 'table'" name="grid" class="w-3.5 h-3.5" />
            <Icon v-else name="list" class="w-3.5 h-3.5" />
            {{ viewMode === 'table' ? '卡片' : '列表' }}
          </button>
          <button class="btn-primary" @click="resetForm(); showNewTaskModal = true">
            <Icon name="arrowR" class="w-3.5 h-3.5" />
            启动新任务
          </button>
        </div>
      </div>

      <!-- 任务模板 -->
      <div class="mb-4">
        <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium mb-2">任务模板 · 一键填充</div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            v-for="tpl in templates" :key="tpl.id"
            class="surface rounded-lg p-3 text-left transition-all hover:border-brand-400 hover:ring-1 hover:ring-brand-600/20"
            @click="applyTemplate(tpl)"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-[13px] font-semibold text-grey-900">{{ tpl.title }}</span>
              <Icon name="arrowR" class="w-3.5 h-3.5 text-grey-400" />
            </div>
            <div class="text-[11px] text-grey-500 leading-snug">{{ tpl.desc }}</div>
            <div class="mt-1.5 text-[10px] text-grey-400 font-mono">via {{ agentName(tpl.agentId) }}</div>
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 mb-3">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1">
          <button
            v-for="f in filters" :key="f.id"
            @click="tasks.setFilter(f.id)"
            :aria-pressed="tasks.filter === f.id"
            :class="['rounded-lg px-3 py-2.5 text-left transition-all',
                     tasks.filter === f.id ? 'bg-grey-200 ring-1 ring-brand-600/20' : 'surface hover:border-grey-300']"
          >
            <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium">{{ f.label }}</div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-[20px] font-semibold tracking-tighter text-grey-900 tabular-nums">{{ tasks.counts[f.id] }}</span>
              <span class="text-[10.5px] text-grey-400 font-mono">{{ f.id === 'done' ? `(${successRate}%)` : '' }}</span>
            </div>
          </button>
        </div>
        <!-- 批量操作 -->
        <div class="flex flex-col gap-1.5 shrink-0">
          <button
            v-if="tasks.counts.done > 0"
            class="btn-ghost text-[11px] py-1 px-2 whitespace-nowrap"
            @click="clearCompletedTasks"
            title="清除所有已完成任务"
          >
            <Icon name="trash" :size="12" />
            清除已完成
          </button>
          <button
            v-if="tasks.counts.failed > 0"
            class="btn-ghost text-[11px] py-1 px-2 whitespace-nowrap text-grey-500"
            @click="clearFailedTasks"
            title="清除所有失败任务"
          >
            <Icon name="trash" :size="12" />
            清除失败
          </button>
        </div>
      </div>
    </div>

    <!-- List / Card -->
    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
      <!-- 骨架屏 -->
      <div v-if="loading" class="surface rounded-xl p-4">
        <SkeletonLoader type="card" :count="4" />
      </div>
      <!-- Table view -->
      <div v-else-if="viewMode === 'table'" class="surface rounded-xl overflow-x-auto">
        <div class="min-w-[720px]">
        <div class="grid grid-cols-[1fr_120px_100px_140px_110px_44px] px-4 py-2.5 hairline-b text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium">
          <div>任务</div>
          <div>智能体</div>
          <div>状态</div>
          <div>进度</div>
          <div class="pl-2">触发</div>
          <div></div>
        </div>
        <template v-for="(t, i) in tasks.visible" :key="t.id">
          <div :class="i !== tasks.visible.length - 1 || expandedId === t.id ? 'hairline-b' : ''">
            <div
              class="grid grid-cols-[1fr_120px_100px_140px_110px_44px] px-4 py-3 items-center group transition-colors hover:bg-grey-100"
              :class="(t.status === 'done' || t.status === 'failed') ? 'cursor-pointer' : ''"
              role="button"
              tabindex="0"
              :aria-expanded="expandedId === t.id"
              :aria-label="`任务：${t.title}，${t.status}`"
              @click="toggleExpand(t)"
              @keydown.enter="toggleExpand(t)"
            >
              <div class="min-w-0">
                <div class="text-[13px] text-grey-800 font-medium truncate">{{ t.title }}</div>
                <div class="text-[10.5px] text-grey-400 font-mono mt-0.5">{{ t.id }} · {{ t.createdAt }}</div>
              </div>
              <div class="text-[12px] text-grey-700 truncate">{{ t.agentName || agentName(t.agentId) }}</div>
              <div>
                <span :class="[getStatusMeta(t.status).chip, 'chip text-[10.5px]']">
                  <span :class="['w-1.5 h-1.5 rounded-full', getStatusMeta(t.status).dot]"></span>
                  {{ getStatusMeta(t.status).label }}
                </span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-1.5 rounded-full bg-grey-100 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="t.status === 'failed' ? 'bg-warning/70' : 'bg-brand-600/70'"
                      :style="{ width: t.progress + '%' }"
                    ></div>
                  </div>
                  <span class="text-[10.5px] text-grey-500 font-mono w-8 text-right">{{ Math.round(t.progress) }}%</span>
                </div>
              </div>
              <div class="pl-2">
                <span :class="[triggerMeta[t.trigger]?.chip || '', 'chip text-[10px]']">
                  {{ triggerMeta[t.trigger]?.label || '手动' }}
                  <span v-if="t.trigger && t.trigger !== 'manual'" class="text-grey-400 ml-0.5">演示</span>
                </span>
              </div>
              <div class="text-right" @click.stop>
                <button
                  v-if="t.status === 'running' || t.status === 'queued'"
                  class="icon-btn text-warning hover:text-warning"
                  title="取消"
                  @click="cancelTask(t)"
                >
                  <Icon name="stop" class="w-4 h-4" />
                </button>
                <button
                  v-else
                  class="icon-btn"
                  :class="expandedId === t.id ? 'text-brand-600' : 'text-grey-400 hover:text-grey-700'"
                  :title="expandedId === t.id ? '收起' : '展开结果'"
                  @click="toggleExpand(t)"
                >
                  <Icon name="arrowDown" class="w-4 h-4 transition-transform" :class="expandedId === t.id ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>
            <!-- 展开结果 -->
            <div v-if="expandedId === t.id" class="px-4 pb-4">
              <div v-if="t.status === 'failed'" class="rounded-lg p-3 text-[12px] text-warning bg-warning/8 border border-warning/20">
                <div class="flex items-center gap-1.5 font-medium mb-1">
                  <Icon name="warn" class="w-3.5 h-3.5" />
                  错误信息
                </div>
                <div class="font-mono text-[11.5px] text-grey-700">{{ t.error }}</div>
              </div>
              <div v-else class="rounded-lg p-3 bg-grey-100 border border-grey-200">
                <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium mb-2">AI 输出</div>
                <pre class="whitespace-pre-wrap break-words text-[12px] text-grey-800 font-sans leading-relaxed">{{ t.output || '（无输出）' }}</pre>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button v-if="t.status === 'failed'" class="btn-outline !text-[11px] !py-1" @click="retryTask(t)">
                  <Icon name="refresh" class="w-3 h-3" />
                  重试
                </button>
                <button v-else class="btn-outline !text-[11px] !py-1" @click="retryTask(t)">
                  <Icon name="refresh" class="w-3 h-3" />
                  重新运行
                </button>
                <button class="btn-outline !text-[11px] !py-1" @click="copyOutput(t)">
                  <Icon name="copy" class="w-3 h-3" />
                  复制结果
                </button>
                <button class="btn-ghost !text-[11px] !py-1 ml-auto" @click="removeTask(t)">
                  <Icon name="trash" class="w-3 h-3" />
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>
        </div>
        <div v-if="!tasks.visible.length" class="py-12 text-center text-[12.5px] text-grey-500">
          这个分类下还没有任务
        </div>
      </div>

      <!-- Card view -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="t in tasks.visible" :key="t.id"
          class="card-hover group"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="min-w-0 cursor-pointer" @click="toggleExpand(t)">
              <div class="text-[13px] text-grey-800 font-medium truncate">{{ t.title }}</div>
              <div class="text-[10.5px] text-grey-400 font-mono mt-0.5">{{ t.id }} · {{ t.createdAt }}</div>
            </div>
            <span :class="[getStatusMeta(t.status).chip, 'chip text-[10.5px] shrink-0']">
              <span :class="['w-1.5 h-1.5 rounded-full', getStatusMeta(t.status).dot]"></span>
              {{ getStatusMeta(t.status).label }}
            </span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-grey-500 mb-2">
            <span>via {{ t.agentName || agentName(t.agentId) }}</span>
            <span :class="[triggerMeta[t.trigger]?.chip || '', 'chip text-[10px]']">
              {{ triggerMeta[t.trigger]?.label || '手动' }}
              <span v-if="t.trigger && t.trigger !== 'manual'" class="text-grey-400 ml-0.5">演示</span>
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-grey-100 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="t.status === 'failed' ? 'bg-warning/70' : 'bg-brand-600/70'"
              :style="{ width: t.progress + '%' }"
            ></div>
          </div>
          <div class="mt-2 flex items-center justify-between text-[10.5px] text-grey-400 font-mono">
            <span>{{ Math.round(t.progress) }}%</span>
            <div class="flex items-center gap-1">
              <button
                v-if="t.status === 'running' || t.status === 'queued'"
                class="icon-btn !p-1 text-warning" title="取消" @click="cancelTask(t)"
              >
                <Icon name="stop" class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="t.status === 'failed'" class="icon-btn !p-1 text-brand-600" title="重试" @click="retryTask(t)"
              >
                <Icon name="refresh" class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="t.status === 'done'" class="icon-btn !p-1 text-grey-500" title="重新运行" @click="retryTask(t)"
              >
                <Icon name="refresh" class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="t.status === 'done' || t.status === 'failed'"
                class="icon-btn !p-1" :class="expandedId === t.id ? 'text-brand-600' : 'text-grey-400'"
                :title="expandedId === t.id ? '收起' : '展开结果'" @click="toggleExpand(t)"
              >
                <Icon name="arrowDown" class="w-3.5 h-3.5 transition-transform" :class="expandedId === t.id ? 'rotate-180' : ''" />
              </button>
            </div>
          </div>
          <!-- 展开结果 -->
          <div v-if="expandedId === t.id" class="mt-3">
            <div v-if="t.status === 'failed'" class="rounded-lg p-2.5 text-[11.5px] text-warning bg-warning/8 border border-warning/20">
              <div class="font-medium mb-1">错误信息</div>
              <div class="font-mono text-[11px] text-grey-700">{{ t.error }}</div>
            </div>
            <div v-else class="rounded-lg p-2.5 bg-grey-100 border border-grey-200">
              <div class="text-[10px] uppercase tracking-[0.12em] text-grey-500 font-medium mb-1.5">AI 输出</div>
              <pre class="whitespace-pre-wrap break-words text-[11.5px] text-grey-800 font-sans leading-relaxed">{{ t.output || '（无输出）' }}</pre>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <button v-if="t.status === 'failed'" class="btn-outline !text-[11px] !py-1" @click="retryTask(t)">重试</button>
              <button v-else class="btn-outline !text-[11px] !py-1" @click="retryTask(t)">重新运行</button>
              <button class="btn-outline !text-[11px] !py-1" @click="copyOutput(t)">复制</button>
              <button class="btn-ghost !text-[11px] !py-1 ml-auto" @click="removeTask(t)">删除</button>
            </div>
          </div>
        </div>
        <div v-if="!tasks.visible.length" class="col-span-full py-12 text-center text-[12.5px] text-grey-500">
          这个分类下还没有任务
        </div>
      </div>
    </div>

    <!-- New task modal -->
    <BaseModal
      v-model="showNewTaskModal"
      title="启动新任务"
      width="md"
    >
      <div class="space-y-3">
        <div>
          <label for="field-task-title" class="block text-[12px] font-medium text-grey-700 mb-1.5">任务标题</label>
          <input
            id="field-task-title"
            v-model="newTaskTitle"
            class="input"
            placeholder="例如：生成 v2.4 PRD 大纲"
            @keydown.enter="createTask"
          />
        </div>
        <div>
          <label for="field-task-agent" class="block text-[12px] font-medium text-grey-700 mb-1.5">调用智能体</label>
          <select id="field-task-agent" v-model="newTaskAgentId" class="input">
            <option v-for="a in agentOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div>
          <label for="field-task-input" class="block text-[12px] font-medium text-grey-700 mb-1.5">任务描述</label>
          <textarea
            id="field-task-input"
            v-model="newTaskInput"
            class="input resize-none"
            rows="4"
            placeholder="描述要让智能体执行的内容，会作为 user 消息发送给 AI"
          ></textarea>
        </div>
        <div>
          <label for="field-task-trigger" class="block text-[12px] font-medium text-grey-700 mb-1.5">触发方式 <span class="text-[10.5px] text-grey-400 font-normal">（定时仅为演示，需手动触发）</span></label>
          <select id="field-task-trigger" v-model="newTaskTrigger" class="input">
            <option value="manual">手动</option>
            <option value="daily">每日（演示）</option>
            <option value="weekly">每周（演示）</option>
          </select>
        </div>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showNewTaskModal = false">取消</button>
        <button class="btn-primary" @click="createTask">
          <Icon name="arrowR" class="w-3.5 h-3.5" />
          启动
        </button>
      </template>
    </BaseModal>
  </div>
</template>
