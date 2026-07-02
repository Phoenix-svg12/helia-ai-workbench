<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/tasks'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useToastStore } from '@/stores/toast'
import { useAgentStore } from '@/stores/agents'
import { useKnowledgeStore } from '@/stores/knowledge'
import { MODEL_OPTIONS } from '@/constants/models'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const tasks = useTaskStore()
const chat = useChatStore()
const ui = useUIStore()
const toast = useToastStore()
const agents = useAgentStore()
const knowledge = useKnowledgeStore()

// 模型切换（使用共享常量）
const models = MODEL_OPTIONS
function cycleModel() {
  const idx = models.findIndex(m => m.id === chat.model)
  const next = models[(idx + 1) % models.length]
  chat.model = next.id
  toast.push(`已切换到 ${next.label}`, 'success')
}
function selectModel(id) {
  chat.model = id
  toast.push(`已切换到 ${id}`, 'success')
}

const tab = ref('context')
const fileInput = ref(null)
const extraContext = ref([])

// 真实上下文：根据当前路由派生（替代硬编码假数据）
const contextItems = computed(() => {
  const list = []
  if (route.path.startsWith('/chat')) {
    // 对话页：展示当前对话最近引用的智能体 + 知识库绑定
    const agent = agents.selected
    if (agent?.id) {
      list.push({
        type: '智能体',
        title: agent.name,
        meta: `systemPrompt · ${agent.systemPrompt?.length || 0} 字`,
        icon: 'spark'
      })
    }
    const kbIds = agent?.knowledgeBaseIds || []
    kbIds.forEach(kbId => {
      // 从 knowledge store 查找真实文档名
      const doc = knowledge.documents.find(d => d.id === kbId)
      list.push({
        type: '知识库',
        title: doc ? doc.name : `KB · ${kbId.slice(-6)}`,
        meta: doc ? `${doc.chunks?.length || 0} 分块 · 已启用 RAG` : 'RAG 检索已启用',
        icon: 'book'
      })
    })
    // 智能体工具
    if (agent?.tools?.length) {
      agent.tools.forEach(t => {
        list.push({
          type: '工具',
          title: t === 'web_search' ? '网页搜索' : t === 'code_exec' ? '代码执行' : t === 'knowledge' ? '知识库检索' : t,
          meta: t,
          icon: 'tool'
        })
      })
    }
  } else if (route.path.startsWith('/agents')) {
    // 智能体页：展示当前选中智能体的配置
    const agent = agents.selected
    if (agent?.id) {
      list.push({
        type: '配置',
        title: `${agent.name} · 设定`,
        meta: `temp ${agent.temperature ?? 0.5} · ${agent.type}`,
        icon: 'code'
      })
      if (agent.skills?.length) {
        list.push({
          type: '技能',
          title: agent.skills.slice(0, 3).join(' · '),
          meta: `共 ${agent.skills.length} 项`,
          icon: 'spark'
        })
      }
    }
  } else if (route.path.startsWith('/tasks')) {
    // 任务页：展示任务统计
    list.push({
      type: '统计',
      title: `任务总览`,
      meta: `全部 ${tasks.counts.all} · 运行 ${tasks.counts.running} · 完成 ${tasks.counts.done}`,
      icon: 'list'
    })
  } else if (route.path.startsWith('/knowledge')) {
    list.push({
      type: '资源',
      title: '知识库文档',
      meta: '查看「知识库」页面',
      icon: 'book'
    })
  }
  return list
})

const allContextItems = computed(() => [...contextItems.value, ...extraContext.value])

// 真实任务列表：取进行中和最近完成的（替代硬编码）
const taskItems = computed(() => {
  return tasks.list
    .filter(t => t.status === 'running' || t.status === 'queued')
    .slice(0, 4)
})

function addContext() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  files.forEach(f => {
    extraContext.value.push({
      type: '新添加',
      title: f.name,
      meta: `${(f.size / 1024).toFixed(1)} KB · ${f.type || '文件'}`,
      icon: 'file'
    })
  })
  toast.push(`已添加 ${files.length} 个上下文`, 'success')
  e.target.value = ''
}

function removeContext(idx) {
  extraContext.value.splice(idx, 1)
  toast.push('已移除上下文', 'info')
}

// 真实消耗统计：从 agents.runLogs 派生 token 总数（替代 $0.012 假数据）
const sessionStats = computed(() => {
  const totalTokens = agents.runLogs.reduce((sum, r) => sum + (r.tokens || 0), 0)
  const totalCalls = agents.runLogs.length
  const doneCalls = agents.runLogs.filter(r => r.status === 'done').length
  // 粗略估算成本（按 1M tokens = $0.5 估算，仅为展示）
  const cost = (totalTokens / 1000000 * 0.5).toFixed(4)
  return { totalTokens, totalCalls, doneCalls, cost }
})
</script>

<template>
  <aside class="app-right-panel">
    <!-- Tabs -->
    <div class="h-11 shrink-0 flex items-center gap-1 px-3 hairline-b">
      <button
        v-for="t in [
          { id: 'context', label: '上下文' },
          { id: 'tasks',   label: '任务' },
          { id: 'meta',    label: '元信息' }
        ]" :key="t.id"
        @click="tab = t.id"
        :class="['text-[12px] px-2.5 py-1 rounded-md transition-colors',
                 tab === t.id ? 'bg-grey-200 text-grey-900' : 'text-grey-500 hover:text-grey-700']"
      >{{ t.label }}</button>
      <span class="ml-auto text-[10.5px] text-grey-400 font-mono">⏎</span>
    </div>

    <!-- Context tab -->
    <div v-if="tab === 'context'" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
      <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1 mb-1.5">
        本次会话的上下文
      </div>
      <div
        v-for="(c, i) in allContextItems" :key="c.id || c.label + i"
        class="group card-hover flex items-start gap-2.5 p-2.5"
      >
        <div class="w-7 h-7 rounded-md bg-grey-100 ring-1 ring-grey-300 flex items-center justify-center shrink-0 text-grey-600">
          <Icon :name="c.icon || 'file'" :size="14" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] text-grey-800 font-medium truncate">{{ c.title }}</div>
          <div class="text-[10.5px] text-grey-500 mt-0.5 truncate">{{ c.meta }}</div>
        </div>
        <span class="chip text-[10px]">{{ c.type }}</span>
        <button
          v-if="i >= contextItems.length"
          @click="removeContext(i - contextItems.length)"
          class="opacity-0 group-hover:opacity-100 text-grey-400 hover:text-error transition-opacity shrink-0"
          title="移除"
        >
          <Icon name="close" :size="12" />
        </button>
      </div>

      <div v-if="!allContextItems.length" class="py-8 text-center text-[12px] text-grey-400">
        当前页面暂无上下文
      </div>

      <input ref="fileInput" type="file" multiple class="hidden" @change="onFileChange" />
      <button @click="addContext" class="w-full btn-ghost justify-center mt-2 !text-[12px]">
        <Icon name="plus" :size="14" />
        添加更多上下文
      </button>
    </div>

    <!-- Tasks tab -->
    <div v-else-if="tab === 'tasks'" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
      <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1 mb-1">
        进行中的任务
      </div>
      <div v-if="!taskItems.length" class="py-8 text-center text-[12px] text-grey-400">
        暂无运行中的任务
      </div>
      <div
        v-for="t in taskItems" :key="t.id"
        class="card p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[12.5px] text-grey-800 font-medium truncate">{{ t.title }}</div>
            <div class="text-[10.5px] text-grey-500 mt-0.5">via {{ t.agentName }} · {{ t.createdAt }}</div>
          </div>
          <span
            class="chip text-[10px]"
            :class="{
              'chip-accent': t.status === 'running',
              'chip-warn':   t.status === 'failed',
              '':            t.status === 'done' || t.status === 'queued'
            }"
          >
            <span v-if="t.status === 'running'" class="w-1 h-1 rounded-full bg-brand-600 animate-pulseDot"></span>
            {{ t.status === 'running' ? '运行中' : t.status === 'done' ? '完成' : t.status === 'failed' ? '失败' : '排队' }}
          </span>
        </div>
        <div class="mt-2 h-1 rounded-full bg-grey-100 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700"
            :class="t.status === 'failed' ? 'bg-warning/70' : 'bg-brand-600/70'"
            :style="{ width: t.progress + '%' }"
          ></div>
        </div>
        <div class="mt-1.5 flex items-center justify-between text-[10.5px] text-grey-400 font-mono">
          <span>{{ Math.round(t.progress) }}%</span>
          <span>{{ t.status === 'running' ? '处理中…' : t.status === 'queued' ? '排队中' : '已完成' }}</span>
        </div>
      </div>
    </div>

    <!-- Meta tab -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      <!-- 模型切换器 -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1">当前模型</div>
          <button class="text-[10px] text-brand-600 hover:text-brand-700 font-medium" @click="cycleModel">循环切换</button>
        </div>
        <div class="space-y-1.5">
          <button
            v-for="m in models" :key="m.id"
            @click="selectModel(m.id)"
            :class="['w-full text-left rounded-lg p-2.5 transition-colors border',
                     chat.model === m.id ? 'bg-brand-600/5 border-brand-600/30' : 'border-grey-300 hover:bg-grey-100']"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="text-[12.5px] font-medium" :class="chat.model === m.id ? 'text-brand-600' : 'text-grey-800'">{{ m.label }}</div>
                <div class="text-[10.5px] text-grey-500 mt-0.5">{{ m.desc }}</div>
              </div>
              <Icon v-if="chat.model === m.id" name="check" :size="16" class="text-brand-600" />
            </div>
          </button>
        </div>
      </div>

      <div>
        <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1 mb-1.5">会话元信息</div>
        <div class="card p-3 text-[12px] text-grey-600 space-y-1.5">
          <div class="flex justify-between"><span class="text-grey-400">模型</span><span class="font-mono">{{ chat.model }}</span></div>
          <div class="flex justify-between"><span class="text-grey-400">温度</span><span class="font-mono">{{ chat.temperature.toFixed(2) }}</span></div>
          <div class="flex justify-between"><span class="text-grey-400">消息数</span><span class="font-mono">{{ chat.activeMessages.length }}</span></div>
          <div class="flex justify-between"><span class="text-grey-400">流式</span><span class="font-mono">{{ chat.isStreaming ? '是' : '否' }}</span></div>
          <div class="flex justify-between"><span class="text-grey-400">网络搜索</span><span class="font-mono">{{ chat.webSearch ? '开' : '关' }}</span></div>
        </div>
      </div>
      <div>
        <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1 mb-1.5">本次会话统计</div>
        <div class="card p-3">
          <div class="flex items-end gap-1.5">
            <span class="text-[28px] font-semibold tracking-tighter leading-none text-grey-900">{{ sessionStats.totalTokens.toLocaleString() }}</span>
            <span class="text-[11px] text-grey-500 mb-1">tokens · {{ sessionStats.doneCalls }}/{{ sessionStats.totalCalls }} 次成功</span>
          </div>
          <div class="mt-2 h-1.5 rounded-full bg-grey-100 overflow-hidden">
            <div class="h-full rounded-full bg-brand-600/70" :style="{ width: Math.min(100, sessionStats.totalCalls * 10) + '%' }"></div>
          </div>
          <div class="mt-1.5 text-[10.5px] text-grey-400 font-mono">估算成本 ${{ sessionStats.cost }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.app-right-panel {
  background: var(--bg-default);
  border-left: 1px solid var(--border-neutral-l1);
}
@screen lg {
  .app-right-panel {
    width: 320px;
    position: static;
    transform: translateX(0);
    box-shadow: none;
    z-index: 1;
  }
}
.app-right-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(8px);
}
@media (max-width: 1023px) {
  .app-right-panel {
    position: fixed;
    inset-block: 0;
    right: 0;
    width: 300px;
    max-width: 85vw;
    z-index: 40;
    box-shadow: 0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08);
  }
}
</style>
