<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore, AUTONOMY_LEVELS } from '@/stores/agents'
import { useToastStore } from '@/stores/toast'
import { useWorkflowStore } from '@/stores/workflow'
import { useSettingsStore } from '@/stores/settings'
import Icon from '@/components/Icon.vue'
import BaseModal from '@/components/BaseModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import NodeLibrary from '@/components/workflow/NodeLibrary.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'

const agents = useAgentStore()
const toast = useToastStore()
const workflow = useWorkflowStore()
const settings = useSettingsStore()
const router = useRouter()

// API 配置状态检测
const aiConfigured = computed(() => settings.isConfigured)
const searchConfigured = computed(() => !!settings.searchApiKey)
const showConfigBanner = ref(true)
function gotoSettings() {
  router.push('/settings')
}

// 确保有激活工作流
if (!workflow.activeWorkflowId) workflow._ensureActive()

const canvasRef = ref(null)
const fileInput = ref(null)
const showNewAgentModal = ref(false)
const showImportModal = ref(false)
const showRunPanel = ref(false)
const showNewWorkflowModal = ref(false)
const showRenameModal = ref(false)
const showDeleteWfConfirm = ref(false)
const importText = ref('')

// 新建智能体表单
const newAgentName = ref('')
const newAgentDesc = ref('')
const newAgentType = ref('对话型')
const newAgentPrompt = ref('')
const newAgentTemp = ref(0.5)
const newAgentGreeting = ref('')
const newAgentQuestions = ref('')
const newAgentAutonomy = ref('auto-edit')

// 新建/重命名工作流
const newWorkflowName = ref('')
const renameWorkflowName = ref('')

// 顶部统计
const stat = computed(() => agents.stats)

// 步骤输出展开状态
const expandedSteps = ref(new Set())
function toggleStepExpand(key) {
  const s = new Set(expandedSteps.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedSteps.value = s
}

// 当前工作流
const activeWorkflow = computed(() => workflow.activeWorkflow)

// 工作流输入
const wfInput = ref('')

// === 工作流管理 ===
function createWorkflow() {
  const name = newWorkflowName.value.trim() || '新工作流'
  const wf = workflow.createWorkflow(name)
  showNewWorkflowModal.value = false
  newWorkflowName.value = ''
  toast.push(`已创建工作流「${wf.name}」`, 'success')
}

function startRenameWorkflow() {
  if (!activeWorkflow.value) return
  renameWorkflowName.value = activeWorkflow.value.name
  showRenameModal.value = true
}

function confirmRenameWorkflow() {
  const name = renameWorkflowName.value.trim()
  if (!name || !activeWorkflow.value) return
  workflow.renameWorkflow(activeWorkflow.value.id, name)
  showRenameModal.value = false
  toast.push('已重命名工作流', 'success')
}

function deleteWorkflow() {
  if (!activeWorkflow.value) return
  if (workflow.workflows.length <= 1) {
    toast.push('至少保留一个工作流', 'warn')
    return
  }
  showDeleteWfConfirm.value = true
}
function confirmDeleteWorkflow() {
  if (!activeWorkflow.value) return
  workflow.deleteWorkflow(activeWorkflow.value.id)
  toast.push('已删除工作流', 'info')
}

function duplicateWorkflow() {
  if (!activeWorkflow.value) return
  const copy = workflow.duplicateWorkflow(activeWorkflow.value.id)
  toast.push(`已复制为「${copy.name}」`, 'success')
}

// === 开始/停止工作流 ===
async function startWorkflow() {
  if (!activeWorkflow.value) return
  if (workflow.isExecuting) {
    toast.push('工作流正在执行中', 'warn')
    return
  }
  const input = wfInput.value.trim() || '请对这段内容做研究摘要、知识库检索和代码评审：本周客户访谈提到首屏加载慢、报告导出模板少、权限粒度粗。'
  showRunPanel.value = true
  toast.push(`开始执行工作流「${activeWorkflow.value.name}」`, 'info')
  await workflow.startWorkflow(input, {
    onStep: (step) => {
      if (step.status === 'running') {
        toast.push(`▶ 节点「${step.label}」开始处理`, 'info')
      } else if (step.status === 'done') {
        const out = step.output || ''
        const preview = out.length > 60 ? out.slice(0, 60) + '…' : out
        toast.push(`✓ 节点「${step.label}」完成：${preview}`, 'success')
      }
    },
    onDone: (run) => {
      toast.push(`工作流${run.status === 'stopped' ? '已停止' : '执行完成'}，共 ${run.steps.length} 步`, run.status === 'stopped' ? 'info' : 'success')
    },
    onError: (e) => toast.push(`工作流失败：${e.message}`, 'error')
  })
}

function stopWorkflow() {
  if (!workflow.isExecuting) return
  workflow.stopWorkflow()
  toast.push('正在停止工作流…', 'info')
}

function clearRuns() {
  workflow.clearRuns()
  toast.push('已清空执行记录', 'info')
}

// === 智能体创建 ===
function createAgent() {
  try {
    const a = agents.create({
      name: newAgentName.value,
      desc: newAgentDesc.value,
      type: newAgentType.value,
      systemPrompt: newAgentPrompt.value,
      temperature: newAgentTemp.value,
      greeting: newAgentGreeting.value,
      suggestedQuestions: newAgentQuestions.value,
      autonomy: newAgentAutonomy.value
    })
    workflow.addNode({
      id: a.id, type: 'agent', label: a.name,
      x: 300 + Math.random() * 100, y: 150 + Math.random() * 100, w: 200, h: 84
    })
    showNewAgentModal.value = false
    resetNewAgentForm()
    toast.push(`已创建智能体「${a.name}」并添加到画布`, 'success')
  } catch (e) {
    toast.push(e.message, 'warn')
  }
}

function resetNewAgentForm() {
  newAgentName.value = ''
  newAgentDesc.value = ''
  newAgentPrompt.value = ''
  newAgentTemp.value = 0.5
  newAgentGreeting.value = ''
  newAgentQuestions.value = ''
  newAgentAutonomy.value = 'auto-edit'
}

// === 导入导出 ===
function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  const f = files[0]
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target.result)
      const a = agents.importRule(json)
      workflow.addNode({ id: a.id, type: 'agent', label: a.name, x: 300, y: 150, w: 200, h: 84 })
      toast.push(`已导入智能体「${a.name}」`, 'success')
    } catch (err) {
      toast.push(`导入失败：${err.message}`, 'error')
    }
  }
  reader.readAsText(f)
  e.target.value = ''
}

function importFromText() {
  try {
    const json = JSON.parse(importText.value)
    const a = agents.importRule(json)
    workflow.addNode({ id: a.id, type: 'agent', label: a.name, x: 300, y: 150, w: 200, h: 84 })
    toast.push(`已导入智能体「${a.name}」`, 'success')
    showImportModal.value = false
    importText.value = ''
  } catch (err) {
    toast.push(`导入失败：${err.message}`, 'error')
  }
}

function exportAgent() {
  const id = workflow.selectedNodeId
  if (!id) { toast.push('请先选中一个智能体节点', 'warn'); return }
  const a = agents.list.find(x => x.id === id)
  if (!a) { toast.push('该节点不是智能体', 'warn'); return }
  const json = agents.exportRule(a.id)
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${a.name}-rule.json`
  link.click()
  URL.revokeObjectURL(url)
  toast.push(`已导出「${a.name}」规则`, 'success')
}

function exportLogs() {
  const logs = agents.recentRuns
  const rows = [['ID', '智能体', '触发', '状态', '耗时', 'Token', '时间']]
  logs.forEach(r => rows.push([r.id, r.agent, r.trigger, r.status, r.dur, r.tok, r.when]))
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `agent-logs-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.push('日志已导出为 CSV', 'success')
}

// 全屏时 body 滚动锁定
watch(() => workflow.viewport.fullscreen, (fs) => {
  if (fs) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''
})

onBeforeUnmount(() => {
  // 恢复 body 滚动，防止页面永久锁定
  document.body.style.overflow = ''
})
</script>

<template>
  <div :class="['wf-page', workflow.viewport.fullscreen ? 'wf-fullscreen' : '']">
    <!-- ===== 顶部工具栏 ===== -->
    <header class="wf-toolbar">
      <div class="wf-toolbar-left">
        <div class="wf-brand">
          <div class="wf-brand-logo"><Icon name="cube" :size="16" class="text-white" /></div>
          <div class="wf-brand-text">
            <div class="wf-brand-name">{{ activeWorkflow?.name || '智能体画布' }}</div>
            <div class="wf-brand-sub">
              {{ workflow.workflowCount }} 个工作流 ·
              {{ workflow.agentNodes.length }} 智能体 ·
              {{ workflow.toolNodes.length }} 工具
            </div>
          </div>
        </div>
        <!-- 开始/停止 -->
        <div class="wf-exec-controls">
          <input
            v-model="wfInput"
            class="wf-exec-input"
            placeholder="输入工作流任务（留空用示例）"
            :disabled="workflow.isExecuting"
          />
          <button
            v-if="!workflow.isExecuting"
            class="wf-btn-start"
            @click="startWorkflow"
          >
            <Icon name="play" :size="14" />
            开始
          </button>
          <button
            v-else
            class="wf-btn-stop"
            @click="stopWorkflow"
          >
            <Icon name="stop" :size="14" />
            停止
          </button>
        </div>
      </div>

      <div class="wf-toolbar-right">
        <button class="wf-tb-btn wf-tb-btn-primary" title="新建智能体" @click="showNewAgentModal = true">
          <Icon name="plus" :size="14" />
          <span class="hidden lg:inline">新建智能体</span>
        </button>
        <button class="wf-tb-btn" title="新建工作流" @click="showNewWorkflowModal = true">
          <Icon name="plus" :size="14" />
          <span class="hidden lg:inline">新工作流</span>
        </button>
        <button class="wf-tb-btn" title="重命名" @click="startRenameWorkflow">
          <Icon name="code" :size="14" />
          <span class="hidden lg:inline">重命名</span>
        </button>
        <button class="wf-tb-btn" title="复制工作流" @click="duplicateWorkflow">
          <Icon name="copy" :size="14" />
          <span class="hidden lg:inline">复制</span>
        </button>
        <div class="wf-tb-divider"></div>
        <button class="wf-tb-btn" title="导入智能体" @click="showImportModal = true">
          <Icon name="upload" :size="14" />
        </button>
        <button class="wf-tb-btn" title="导出选中节点" @click="exportAgent">
          <Icon name="download" :size="14" />
        </button>
        <button class="wf-tb-btn" title="导出日志" @click="exportLogs">
          <Icon name="doc" :size="14" />
        </button>
        <div class="wf-tb-divider"></div>
        <button
          class="wf-tb-btn"
          :class="showRunPanel ? 'wf-tb-btn-active' : ''"
          title="执行记录"
          @click="showRunPanel = !showRunPanel"
        >
          <Icon name="list" :size="14" />
          <span v-if="workflow.runs.length" class="wf-tb-badge">{{ workflow.runs.length }}</span>
        </button>
        <button
          class="wf-tb-btn"
          :title="workflow.viewport.fullscreen ? '退出全屏' : '全屏'"
          @click="workflow.toggleFullscreen()"
        >
          <Icon :name="workflow.viewport.fullscreen ? 'close' : 'grid'" :size="14" />
        </button>
      </div>
    </header>

    <!-- ===== 配置警告横幅 ===== -->
    <transition name="page">
      <div v-if="showConfigBanner && (!aiConfigured || !searchConfigured)" class="wf-config-banner">
        <div class="wf-config-banner-inner">
          <Icon name="warn" :size="16" class="wf-config-icon" />
          <div class="wf-config-content">
            <span v-if="!aiConfigured" class="wf-config-item">
              <strong>AI 模型 API Key 未配置</strong> — 智能体节点将使用本地演示模式（模拟回复）
            </span>
            <span v-if="!aiConfigured && !searchConfigured" class="wf-config-sep">·</span>
            <span v-if="!searchConfigured" class="wf-config-item">
              <strong>搜索 API Key 未配置</strong> — 工作流中的「Web 搜索」节点无法联网
            </span>
          </div>
          <button class="wf-config-btn" @click="gotoSettings">
            <Icon name="gear" :size="13" />
            前往配置
          </button>
          <button class="wf-config-close" title="关闭" @click="showConfigBanner = false">
            <Icon name="close" :size="14" />
          </button>
        </div>
      </div>
    </transition>

    <!-- ===== 主体三栏 ===== -->
    <div class="wf-main">
      <!-- 左侧：工作流列表 + 节点库 -->
      <aside class="wf-side wf-side-left" v-if="!workflow.viewport.fullscreen">
        <!-- 工作流列表 -->
        <div class="wf-wf-list">
          <div class="wf-wf-list-head">
            <span class="wf-wf-list-title">工作流</span>
            <button class="wf-wf-add-btn" title="新建工作流" @click="showNewWorkflowModal = true">
              <Icon name="plus" :size="14" />
            </button>
          </div>
          <div class="wf-wf-items">
            <button
              v-for="wf in workflow.workflows" :key="wf.id"
              @click="workflow.switchWorkflow(wf.id)"
              :class="['wf-wf-item', wf.id === workflow.activeWorkflowIdResolved ? 'wf-wf-item-active' : '']"
            >
              <Icon name="cube" :size="13" class="wf-wf-item-icon" />
              <div class="wf-wf-item-body">
                <div class="wf-wf-item-name">{{ wf.name }}</div>
                <div class="wf-wf-item-meta">
                  {{ wf.nodes.filter(n => n.type !== 'io').length }} 节点
                  <span v-if="wf.lastRunAt"> · {{ wf.lastRunAt }}</span>
                </div>
              </div>
              <span v-if="wf.id === workflow.activeWorkflowIdResolved && workflow.isExecuting" class="wf-wf-running-dot"></span>
            </button>
          </div>
          <!-- 工作流操作 -->
          <div class="wf-wf-actions">
            <button class="wf-wf-action-btn" @click="startRenameWorkflow" title="重命名">
              <Icon name="code" :size="12" />
            </button>
            <button class="wf-wf-action-btn" @click="duplicateWorkflow" title="复制">
              <Icon name="copy" :size="12" />
            </button>
            <button class="wf-wf-action-btn wf-wf-action-del" @click="deleteWorkflow" title="删除">
              <Icon name="trash" :size="12" />
            </button>
          </div>
        </div>

        <!-- 节点库 -->
        <div class="wf-lib-wrap">
          <NodeLibrary />
        </div>
      </aside>

      <!-- 中间：画布 -->
      <main class="wf-canvas-wrap">
        <WorkflowCanvas ref="canvasRef" />

        <!-- 执行步骤浮层（底部） -->
        <transition name="page">
          <div v-if="showRunPanel && (workflow.activeRun || workflow.runs.length)" class="wf-run-panel">
            <div class="wf-run-panel-head">
              <div class="wf-run-panel-title">
                <Icon name="list" :size="13" />
                执行记录
                <span v-if="workflow.isExecuting" class="wf-run-live">运行中</span>
              </div>
              <div class="wf-run-panel-actions">
                <button v-if="workflow.isExecuting" class="wf-btn-stop !h-7 !text-[11px]" @click="stopWorkflow">
                  <Icon name="stop" :size="12" /> 停止
                </button>
                <button v-if="workflow.runs.length" class="wf-tb-btn !h-7" @click="clearRuns">清空</button>
                <button v-if="!workflow.isExecuting" class="wf-tb-btn !h-7" title="关闭" aria-label="关闭" @click="showRunPanel = false"><Icon name="close" :size="13" /></button>
              </div>
            </div>
            <div class="wf-run-steps">
              <div
                v-for="step in (workflow.activeRun || workflow.runs[0])?.steps || []" :key="step.nodeId + '-' + step.startedAt"
                class="wf-run-step"
              >
                <div class="wf-run-step-head">
                  <span :class="['wf-run-step-dot', step.status === 'running' ? 'wf-dot-running' : step.status === 'failed' ? 'wf-dot-failed' : step.status === 'stopped' ? 'wf-dot-stopped' : 'wf-dot-done']"></span>
                  <span class="wf-run-step-label">{{ step.label }}</span>
                  <span class="wf-run-step-type">{{ step.type }}</span>
                  <span class="wf-run-step-time">
                    {{ step.endedAt ? ((step.endedAt - step.startedAt) / 1000).toFixed(1) + 's' : '处理中…' }}
                  </span>
                </div>
                <div v-if="step.output" class="wf-run-step-output">
                  <template v-if="step.output.length > 300">
                    <span>{{ expandedSteps.has(step.nodeId + step.startedAt) ? step.output : step.output.slice(0, 300) + '…' }}</span>
                    <button class="wf-expand-btn" @click="toggleStepExpand(step.nodeId + step.startedAt)">
                      {{ expandedSteps.has(step.nodeId + step.startedAt) ? '收起' : '展开全文' }}
                    </button>
                  </template>
                  <template v-else>{{ step.output }}</template>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </main>

      <!-- 右侧：属性面板 -->
      <aside class="wf-side wf-side-right" v-if="!workflow.viewport.fullscreen">
        <NodeInspector />
      </aside>
    </div>

    <!-- ===== 新建工作流弹窗 ===== -->
    <BaseModal v-model="showNewWorkflowModal" title="新建工作流" width="sm">
      <div>
        <label for="field-workflow-name" class="block text-[12px] font-medium text-grey-700 mb-1.5">工作流名称</label>
        <input
          id="field-workflow-name"
          v-model="newWorkflowName"
          class="input"
          placeholder="例如：客户调研工作流"
          @keydown.enter="createWorkflow"
        />
        <p class="text-[10.5px] text-grey-400 mt-2">新建后为空白画布（含输入/输出节点），可从左侧节点库添加智能体和工具。</p>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showNewWorkflowModal = false">取消</button>
        <button class="btn-primary" @click="createWorkflow">
          <Icon name="plus" :size="14" />
          创建
        </button>
      </template>
    </BaseModal>

    <!-- ===== 重命名工作流弹窗 ===== -->
    <BaseModal v-model="showRenameModal" title="重命名工作流" width="sm">
      <div>
        <label for="field-workflow-rename" class="block text-[12px] font-medium text-grey-700 mb-1.5">新名称</label>
        <input
          id="field-workflow-rename"
          v-model="renameWorkflowName"
          class="input"
          placeholder="工作流名称"
          @keydown.enter="confirmRenameWorkflow"
        />
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showRenameModal = false">取消</button>
        <button class="btn-primary" @click="confirmRenameWorkflow">
          <Icon name="check" :size="14" />
          确认
        </button>
      </template>
    </BaseModal>

    <!-- ===== 新建智能体弹窗 ===== -->
    <BaseModal v-model="showNewAgentModal" title="新建智能体" width="md">
      <div class="space-y-3">
        <div>
          <label for="field-agent-name" class="block text-[12px] font-medium text-grey-700 mb-1.5">智能体名称</label>
          <input id="field-agent-name" v-model="newAgentName" class="input" placeholder="例如：数据分析师" @keydown.enter="createAgent" />
        </div>
        <div>
          <label for="field-agent-desc" class="block text-[12px] font-medium text-grey-700 mb-1.5">描述</label>
          <input id="field-agent-desc" v-model="newAgentDesc" class="input" placeholder="简要描述智能体用途" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="field-agent-type" class="block text-[12px] font-medium text-grey-700 mb-1.5">类型</label>
            <select id="field-agent-type" v-model="newAgentType" class="input">
              <option value="对话型">对话型</option>
              <option value="工作流型">工作流型</option>
              <option value="工具型">工具型</option>
            </select>
          </div>
          <div>
            <label for="field-agent-temperature" class="block text-[12px] font-medium text-grey-700 mb-1.5">Temperature: {{ newAgentTemp.toFixed(2) }}</label>
            <input id="field-agent-temperature" v-model.number="newAgentTemp" type="range" min="0" max="1" step="0.05" class="w-full mt-2" style="accent-color: #4B3FE3;" />
          </div>
        </div>
        <div>
          <label for="field-agent-prompt" class="block text-[12px] font-medium text-grey-700 mb-1.5">System Prompt</label>
          <textarea id="field-agent-prompt" v-model="newAgentPrompt" class="input font-mono text-[11.5px] resize-none" rows="4" placeholder="留空将根据名称和描述自动生成"></textarea>
        </div>
        <div>
          <label for="field-agent-greeting" class="block text-[12px] font-medium text-grey-700 mb-1.5">开场白（可选）</label>
          <textarea id="field-agent-greeting" v-model="newAgentGreeting" class="input resize-none" rows="2" placeholder="用户打开对话时显示的欢迎语"></textarea>
        </div>
        <div>
          <label for="field-agent-questions" class="block text-[12px] font-medium text-grey-700 mb-1.5">推荐问题（可选，每行一个）</label>
          <textarea id="field-agent-questions" v-model="newAgentQuestions" class="input resize-none" rows="2" placeholder="帮助我总结这份报告&#10;对比这两个方案的优劣"></textarea>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-grey-700 mb-1.5">自主度</label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="lvl in AUTONOMY_LEVELS" :key="lvl.id"
              type="button"
              @click="newAgentAutonomy = lvl.id"
              :class="['rounded-md px-2 py-2 text-[11px] font-medium transition-all border text-center',
                       newAgentAutonomy === lvl.id ? 'bg-brand-600/10 border-brand-600/30 text-brand-600' : 'border-grey-200 text-grey-500 hover:border-grey-300']"
            >{{ lvl.label }}</button>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showNewAgentModal = false">取消</button>
        <button class="btn-primary" @click="createAgent">
          <Icon name="plus" :size="14" />
          创建并添加到画布
        </button>
      </template>
    </BaseModal>

    <!-- ===== 导入弹窗 ===== -->
    <BaseModal v-model="showImportModal" title="导入智能体规则" desc="粘贴 JSON 规则或选择文件" width="md">
      <textarea
        v-model="importText"
        class="input font-mono text-[11.5px] resize-none"
        rows="8"
        placeholder='{ "kind": "helia-agent-rule", "rule": { "name": "..." } }'
      ></textarea>
      <div class="mt-3 flex items-center gap-2">
        <button class="btn-outline" @click="fileInput?.click()">
          <Icon name="doc" :size="14" />
          选择 JSON 文件
        </button>
      </div>
      <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileChange" />
      <template #footer>
        <button class="btn-ghost" @click="showImportModal = false">取消</button>
        <button class="btn-primary" @click="importFromText" :disabled="!importText.trim()">
          <Icon name="upload" :size="14" />
          导入
        </button>
      </template>
    </BaseModal>

    <!-- 删除工作流确认弹窗 -->
    <ConfirmDialog
      v-model="showDeleteWfConfirm"
      title="删除工作流"
      :desc="`删除工作流「${activeWorkflow?.name}」？此操作不可撤销。`"
      confirm-text="删除"
      danger
      @confirm="confirmDeleteWorkflow"
    />
  </div>
</template>

<style scoped>
.wf-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}
.wf-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--bg-secondary);
}

/* 顶部工具栏 */
.wf-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 56px;
  background: var(--bg-default);
  border-bottom: 1px solid var(--overlay-l1);
  flex-shrink: 0;
  gap: 16px;
}
.wf-toolbar-left { display: flex; align-items: center; gap: 20px; min-width: 0; flex: 1; }
.wf-brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.wf-brand-logo {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--brand);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.wf-brand-text { line-height: 1.2; min-width: 0; }
.wf-brand-name { font-size: 0.875rem; font-weight: 600; color: var(--text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.wf-brand-sub { font-size: 0.6875rem; color: var(--text-disabled); margin-top: 1px; white-space: nowrap; }

/* 开始/停止控件 */
.wf-exec-controls { display: flex; align-items: center; gap: 8px; flex: 1; max-width: 520px; }
.wf-exec-input {
  flex: 1;
  height: 34px;
  padding: 0 12px;
  font-size: 0.78125rem;
  background: rgba(115,115,115,0.04);
  border: 1px solid rgba(115,115,115,0.12);
  border-radius: 8px;
  outline: none;
  transition: all 0.12s;
}
.wf-exec-input::placeholder { color: var(--text-disabled); }
.wf-exec-input:focus { border-color: rgba(75,63,227,0.4); background: var(--bg-default); box-shadow: 0 0 0 3px rgba(75,63,227,0.08); }
.wf-btn-start, .wf-btn-stop {
  display: flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 16px;
  font-size: 0.78125rem; font-weight: 500;
  border: none; border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.wf-btn-start { background: var(--status-success); color: #fff; }
.wf-btn-start:hover { background: #128B64; }
.wf-btn-stop { background: var(--status-error); color: #fff; }
.wf-btn-stop:hover { background: #C9352B; }

.wf-toolbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.wf-tb-btn {
  display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 9px;
  font-size: 0.75rem; color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--overlay-l1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  position: relative;
}
.wf-tb-btn:hover { background: rgba(115,115,115,0.06); color: var(--text-default); }
.wf-tb-btn-active { background: rgba(75,63,227,0.08); color: var(--brand); border-color: rgba(75,63,227,0.25); }
.wf-tb-btn-primary { background: var(--brand); color: #fff; border-color: var(--brand); }
.wf-tb-btn-primary:hover { background: var(--brand-active); color: #fff; }
.wf-tb-divider { width: 1px; height: 20px; background: var(--overlay-l1); margin: 0 2px; }
.wf-tb-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e8463a;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
}

/* 主体 */
.wf-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 0;
}
.wf-fullscreen .wf-main { grid-template-columns: 1fr; }

/* 宽屏：三栏布局 */
@media (min-width: 1280px) {
  .wf-main {
    grid-template-columns: 240px 1fr 300px;
  }
}

/* 中等屏幕：隐藏右栏，保留工作流侧栏 + 画布 */
@media (max-width: 1279px) {
  .wf-side-right { display: none; }
}

/* 小屏幕：仅画布 */
@media (max-width: 767px) {
  .wf-main { grid-template-columns: 1fr; }
  .wf-side-left { display: none; }
  .wf-exec-controls { max-width: none; }
}

.wf-side {
  background: var(--bg-default);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.wf-side-left { border-right: 1px solid var(--overlay-l1); }
.wf-side-right { border-left: 1px solid var(--overlay-l1); }

/* 左侧：工作流列表 + 节点库 */
.wf-wf-list {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--overlay-l1);
  max-height: 40%;
  flex-shrink: 0;
}
.wf-wf-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
}
.wf-wf-list-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.wf-wf-add-btn {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  color: var(--brand);
  background: rgba(75,63,227,0.08);
  border: none;
  cursor: pointer;
  transition: background 0.12s;
}
.wf-wf-add-btn:hover { background: rgba(75,63,227,0.15); }

.wf-wf-items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px;
}
.wf-wf-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
  margin-bottom: 2px;
}
.wf-wf-item:hover { background: rgba(115,115,115,0.04); }
.wf-wf-item-active {
  background: rgba(75,63,227,0.08) !important;
  border-color: rgba(75,63,227,0.2) !important;
}
.wf-wf-item-icon { color: var(--text-disabled); flex-shrink: 0; }
.wf-wf-item-active .wf-wf-item-icon { color: var(--brand); }
.wf-wf-item-body { flex: 1; min-width: 0; }
.wf-wf-item-name {
  font-size: 0.75rem; font-weight: 500; color: var(--text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wf-wf-item-active .wf-wf-item-name { color: var(--brand); }
.wf-wf-item-meta { font-size: 0.625rem; color: var(--text-disabled); margin-top: 1px; white-space: nowrap; }
.wf-wf-running-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--status-success);
  animation: pulseDot 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

.wf-wf-actions {
  display: flex;
  gap: 4px;
  padding: 6px 10px 10px;
  border-top: 1px solid rgba(115,115,115,0.06);
}
.wf-wf-action-btn {
  flex: 1;
  height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid var(--overlay-l1);
  cursor: pointer;
  transition: all 0.12s;
}
.wf-wf-action-btn:hover { background: rgba(115,115,115,0.06); color: var(--text-secondary); }
.wf-wf-action-del:hover { color: var(--status-error); border-color: rgba(232,70,58,0.2); background: rgba(232,70,58,0.04); }

.wf-lib-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

/* 画布 */
.wf-canvas-wrap { position: relative; min-height: 0; }

/* 执行记录浮层 */
.wf-run-panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  max-height: 240px;
  background: var(--bg-default);
  border: 1px solid var(--border-neutral-l1);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 30;
}
.wf-run-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--overlay-l1);
  background: rgba(115,115,115,0.02);
}
.wf-run-panel-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
}
.wf-run-live {
  font-size: 0.625rem; color: var(--status-success); font-weight: 600;
  background: rgba(21,168,119,0.1);
  padding: 1px 6px; border-radius: 4px;
}
.wf-run-panel-actions { display: flex; align-items: center; gap: 4px; }

.wf-run-steps { flex: 1; overflow-y: auto; padding: 8px 14px; }
.wf-run-step {
  background: rgba(115,115,115,0.03);
  border: 1px solid var(--overlay-l1);
  border-radius: 8px;
  padding: 7px 10px;
  margin-bottom: 6px;
}
.wf-run-step-head { display: flex; align-items: center; gap: 8px; }
.wf-run-step-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.wf-dot-running { background: var(--brand); animation: pulseDot 1.4s ease-in-out infinite; }
.wf-dot-failed { background: var(--status-error); }
.wf-dot-stopped { background: var(--status-warning); }
.wf-dot-done { background: var(--status-success); }
.wf-run-step-label { font-size: 0.75rem; font-weight: 500; color: var(--text-default); }
.wf-run-step-type { font-size: 9.5px; color: var(--text-disabled); background: rgba(115,115,115,0.06); padding: 1px 5px; border-radius: 4px; }
.wf-run-step-time { margin-left: auto; font-size: 0.6875rem; color: var(--text-disabled); font-family: 'JetBrains Mono', monospace; }
.wf-run-step-output {
  font-size: 0.6875rem; color: var(--text-secondary);
  margin-top: 6px; padding: 6px 8px;
  background: var(--bg-default); border-radius: 4px;
  border: 1px solid rgba(115,115,115,0.06);
  max-height: 120px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
}
.wf-expand-btn {
  display: inline-block; margin-left: 4px;
  font-size: 0.6875rem; color: var(--brand);
  background: none; border: none; cursor: pointer;
  text-decoration: underline; padding: 0;
}
.wf-expand-btn:hover { opacity: 0.8; }

@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

/* 配置警告横幅 */
.wf-config-banner {
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04));
  border-bottom: 1px solid rgba(245,158,11,0.2);
  padding: 8px 16px;
}
.wf-config-banner-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}
.wf-config-icon {
  color: #d97706;
  flex-shrink: 0;
}
.wf-config-content {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.wf-config-item strong {
  color: #92400e;
  font-weight: 600;
}
.wf-config-sep {
  color: var(--text-disabled);
  margin: 0 2px;
}
.wf-config-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 500;
  color: #fff;
  background: #d97706;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  flex-shrink: 0;
}
.wf-config-btn:hover { background: #b45309; }
.wf-config-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-disabled);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s;
}
.wf-config-close:hover { background: rgba(115,115,115,0.08); color: var(--text-secondary); }
</style>
