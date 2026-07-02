<script setup>
/**
 * AddNodePicker.vue —— 添加节点选择弹窗
 *
 * 从节点的"+"按钮触发，让用户选择要添加到下游/上游的节点：
 *   - 智能体：列出未在画布中的智能体
 *   - 工具：列出可用工具
 *   - 新建：快速创建一个新智能体
 *
 * 选择后通过 @add 事件回调，父组件负责添加节点 + 连线。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore, AVAILABLE_TOOLS, AUTONOMY_LEVELS } from '@/stores/agents'
import { useWorkflowStore } from '@/stores/workflow'
import { useToastStore } from '@/stores/toast'
import Icon from '@/components/Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 触发节点 id（添加后会自动连一条边） */
  fromNodeId: { type: String, default: '' },
  /** 方向：'out' = 添加下游 | 'in' = 添加上游 */
  side: { type: String, default: 'out' }
})
const emit = defineEmits(['update:modelValue', 'add'])

const agents = useAgentStore()
const workflow = useWorkflowStore()
const toast = useToastStore()

const tab = ref('agent') // agent | tool | new
const query = ref('')

// 新建智能体表单
const newName = ref('')
const newDesc = ref('')
const newType = ref('对话型')
const newAutonomy = ref('auto-edit')

// 已在画布上的智能体 id 集合（避免重复添加）
const onCanvasAgentIds = computed(() =>
  new Set(workflow.nodes.filter(n => n.type === 'agent').map(n => n.id))
)

// 可添加的智能体列表（未在画布上的）
const availableAgents = computed(() => {
  let list = agents.list.filter(a => !onCanvasAgentIds.value.has(a.id))
  if (query.value.trim()) {
    const k = query.value.toLowerCase()
    list = list.filter(a =>
      a.name.toLowerCase().includes(k) ||
      (a.desc || '').toLowerCase().includes(k)
    )
  }
  return list
})

// 工具列表
const availableTools = computed(() => {
  let list = AVAILABLE_TOOLS
  if (query.value.trim()) {
    const k = query.value.toLowerCase()
    list = list.filter(t =>
      t.label.toLowerCase().includes(k) ||
      t.desc.toLowerCase().includes(k)
    )
  }
  return list
})

// 重置表单
function resetForm() {
  newName.value = ''
  newDesc.value = ''
  newType.value = '对话型'
  newAutonomy.value = 'auto-edit'
  query.value = ''
  tab.value = 'agent'
}

// 弹窗打开时重置
watch(() => props.modelValue, (open) => {
  if (open) resetForm()
})

// 选择已有智能体
function pickAgent(a) {
  emit('add', {
    kind: 'agent',
    id: a.id,
    label: a.name,
    color: a.color
  })
  close()
}

// 选择工具
function pickTool(t) {
  emit('add', {
    kind: 'tool',
    id: 'tool-' + Date.now(),
    toolId: t.id,
    label: t.label,
    color: '#2F74FF'
  })
  close()
}

// 新建智能体并添加
function createAndAdd() {
  const name = newName.value.trim()
  if (!name) {
    toast.push('请输入智能体名称', 'warn')
    return
  }
  try {
    const a = agents.create({
      name,
      desc: newDesc.value.trim() || '自定义智能体',
      type: newType.value,
      autonomy: newAutonomy.value,
      systemPrompt: '',
      temperature: 0.5,
      greeting: '',
      suggestedQuestions: ''
    })
    emit('add', {
      kind: 'agent',
      id: a.id,
      label: a.name,
      color: a.color
    })
    toast.push(`已创建智能体「${a.name}」`, 'success')
    close()
  } catch (e) {
    toast.push(e.message, 'warn')
  }
}

function close() {
  emit('update:modelValue', false)
}

// Esc 关闭
function onKey(e) {
  if (e.key === 'Escape' && props.modelValue) {
    e.preventDefault()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <transition name="wf-picker">
      <div
        v-if="modelValue"
        class="wf-picker-mask"
        @click.self="close"
      >
        <div class="wf-picker-panel" @click.stop>
          <!-- 头部 -->
          <div class="wf-picker-head">
            <div class="wf-picker-title">
              <div class="wf-picker-title-icon">
                <Icon name="plus" :size="14" />
              </div>
              <div class="wf-picker-title-text">
                <div class="wf-picker-title-main">{{ side === 'out' ? '添加下游节点' : '添加上游节点' }}</div>
                <div class="wf-picker-title-sub">选择已有或新建一个节点</div>
              </div>
            </div>
            <button class="wf-picker-close" @click="close" aria-label="关闭">
              <Icon name="close" :size="14" />
            </button>
          </div>

          <!-- Tab 分类 -->
          <div class="wf-picker-tabs">
            <button
              :class="['wf-picker-tab', tab === 'agent' ? 'wf-tab-active' : '']"
              @click="tab = 'agent'; query = ''"
            >
              <Icon name="spark" :size="13" />
              <span>智能体</span>
              <span class="wf-tab-count">{{ availableAgents.length }}</span>
            </button>
            <button
              :class="['wf-picker-tab', tab === 'tool' ? 'wf-tab-active' : '']"
              @click="tab = 'tool'; query = ''"
            >
              <Icon name="tool" :size="13" />
              <span>工具</span>
              <span class="wf-tab-count">{{ availableTools.length }}</span>
            </button>
            <button
              :class="['wf-picker-tab', tab === 'new' ? 'wf-tab-active' : '']"
              @click="tab = 'new'; query = ''"
            >
              <Icon name="plus" :size="13" />
              <span>新建</span>
            </button>
          </div>

          <!-- 搜索框（仅智能体/工具 tab） -->
          <div v-if="tab !== 'new'" class="wf-picker-search-wrap">
            <Icon name="search" :size="13" class="wf-picker-search-icon" />
            <input
              v-model="query"
              class="wf-picker-search"
              :placeholder="tab === 'agent' ? '搜索智能体…' : '搜索工具…'"
            />
            <button v-if="query" class="wf-picker-search-clear" @click="query = ''">
              <Icon name="close" :size="11" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="wf-picker-body">
            <!-- 智能体列表 -->
            <div v-if="tab === 'agent'">
              <div v-if="!availableAgents.length" class="wf-picker-empty">
                <Icon name="spark" :size="28" class="wf-empty-icon" />
                <p v-if="agents.list.length === 0">还没有智能体，去「新建」tab 创建一个</p>
                <p v-else>所有智能体都已在画布上</p>
              </div>
              <div v-else class="wf-picker-list">
                <button
                  v-for="a in availableAgents" :key="a.id"
                  class="wf-picker-row"
                  @click="pickAgent(a)"
                >
                  <div
                    class="wf-picker-row-icon"
                    :style="{ background: (a.color || '#4B3FE3') + '15', color: a.color || '#4B3FE3' }"
                  >
                    {{ (a.name || '?')[0] }}
                  </div>
                  <div class="wf-picker-row-body">
                    <div class="wf-picker-row-top">
                      <span class="wf-picker-row-label">{{ a.name }}</span>
                      <span class="wf-picker-row-badge">{{ a.type }}</span>
                    </div>
                    <div class="wf-picker-row-desc">{{ a.desc || '自定义智能体' }}</div>
                  </div>
                  <Icon name="arrowR" :size="14" class="wf-picker-row-arrow" />
                </button>
              </div>
            </div>

            <!-- 工具列表 -->
            <div v-else-if="tab === 'tool'">
              <div v-if="!availableTools.length" class="wf-picker-empty">
                <Icon name="tool" :size="28" class="wf-empty-icon" />
                <p>没有匹配的工具</p>
              </div>
              <div v-else class="wf-picker-list">
                <button
                  v-for="t in availableTools" :key="t.id"
                  class="wf-picker-row"
                  @click="pickTool(t)"
                >
                  <div class="wf-picker-row-icon wf-picker-row-icon-tool">
                    <Icon :name="t.icon" :size="15" />
                  </div>
                  <div class="wf-picker-row-body">
                    <div class="wf-picker-row-top">
                      <span class="wf-picker-row-label">{{ t.label }}</span>
                      <span class="wf-picker-row-badge">工具</span>
                    </div>
                    <div class="wf-picker-row-desc">{{ t.desc }}</div>
                  </div>
                  <Icon name="arrowR" :size="14" class="wf-picker-row-arrow" />
                </button>
              </div>
            </div>

            <!-- 新建智能体 -->
            <div v-else class="wf-picker-form">
              <div class="wf-form-row">
                <label for="field-picker-name">名称 <span class="wf-req">*</span></label>
                <input
                  id="field-picker-name"
                  v-model="newName"
                  class="wf-form-input"
                  placeholder="例如：数据分析师"
                  @keydown.enter="createAndAdd"
                />
              </div>
              <div class="wf-form-row">
                <label for="field-picker-desc">描述</label>
                <input
                  id="field-picker-desc"
                  v-model="newDesc"
                  class="wf-form-input"
                  placeholder="简要描述智能体用途"
                />
              </div>
              <div class="wf-form-row">
                <label>类型</label>
                <div class="wf-form-types">
                  <button
                    v-for="t in ['对话型', '工作流型', '工具型']" :key="t"
                    :class="['wf-form-type-btn', newType === t ? 'wf-type-active' : '']"
                    @click="newType = t"
                  >{{ t }}</button>
                </div>
              </div>
              <div class="wf-form-row">
                <label>自主度</label>
                <div class="wf-form-types">
                  <button
                    v-for="lvl in AUTONOMY_LEVELS" :key="lvl.id"
                    :class="['wf-form-type-btn', newAutonomy === lvl.id ? 'wf-type-active' : '']"
                    :title="lvl.desc"
                    @click="newAutonomy = lvl.id"
                  >{{ lvl.label }}</button>
                </div>
              </div>
              <button class="wf-form-submit" @click="createAndAdd">
                <Icon name="plus" :size="14" />
                创建并添加到{{ side === 'out' ? '下游' : '上游' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.wf-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.32);
  backdrop-filter: blur(4px);
  padding: 24px;
}
.wf-picker-panel {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  background: var(--bg-default);
  border-radius: 16px;
  box-shadow: var(--shadow-dialog);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.wf-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--overlay-l1);
  flex-shrink: 0;
}
.wf-picker-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.wf-picker-title-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(75,63,227,0.1);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wf-picker-title-text { min-width: 0; }
.wf-picker-title-main {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-default);
  line-height: 1.3;
}
.wf-picker-title-sub {
  font-size: 0.6875rem;
  color: var(--text-disabled);
  margin-top: 1px;
}
.wf-picker-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  flex-shrink: 0;
}
.wf-picker-close:hover { background: var(--overlay-l1); color: var(--text-default); }

/* Tabs */
.wf-picker-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 18px 0;
  flex-shrink: 0;
}
.wf-picker-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  min-width: 0;
}
.wf-picker-tab > span:not(.wf-tab-count) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-picker-tab:hover { background: rgba(115,115,115,0.06); color: var(--text-secondary); }
.wf-tab-active {
  background: rgba(75,63,227,0.08) !important;
  color: var(--brand) !important;
  border-color: rgba(75,63,227,0.2) !important;
}
.wf-tab-count {
  font-size: 0.625rem;
  color: var(--text-disabled);
  background: var(--overlay-l1);
  padding: 1px 5px;
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}
.wf-tab-active .wf-tab-count { background: rgba(75,63,227,0.15); color: var(--brand); }

/* 搜索框 */
.wf-picker-search-wrap {
  position: relative;
  padding: 12px 18px;
  flex-shrink: 0;
}
.wf-picker-search-icon {
  position: absolute;
  left: 30px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-disabled);
  pointer-events: none;
}
.wf-picker-search {
  width: 100%;
  height: 34px;
  padding: 0 32px 0 32px;
  font-size: 0.78125rem;
  background: rgba(115,115,115,0.04);
  border: 1px solid rgba(115,115,115,0.1);
  border-radius: 8px;
  outline: none;
  transition: all 0.12s;
  box-sizing: border-box;
}
.wf-picker-search:focus {
  background: var(--bg-default);
  border-color: rgba(75,63,227,0.4);
  box-shadow: 0 0 0 3px rgba(75,63,227,0.08);
}
.wf-picker-search-clear {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-disabled);
  cursor: pointer;
  padding: 2px;
  background: transparent;
  border: none;
  display: flex;
}
.wf-picker-search-clear:hover { color: var(--text-secondary); }

/* 内容区 */
.wf-picker-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 16px;
}
.wf-picker-empty {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-disabled);
  font-size: 0.75rem;
}
.wf-empty-icon {
  color: #D4D4D4;
  margin: 0 auto 8px;
  display: block;
}

/* 列表（单列，避免内容截断） */
.wf-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wf-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
  width: 100%;
}
.wf-picker-row:hover {
  background: rgba(75,63,227,0.04);
  border-color: rgba(75,63,227,0.15);
}
.wf-picker-row-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}
.wf-picker-row-icon-tool {
  background: rgba(47,116,255,0.1);
  color: var(--status-info);
}
.wf-picker-row-body {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.wf-picker-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.wf-picker-row-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.wf-picker-row-badge {
  font-size: 9.5px;
  color: var(--text-disabled);
  background: var(--overlay-l1);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  white-space: nowrap;
}
.wf-picker-row-desc {
  font-size: 0.6875rem;
  color: var(--text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-picker-row-arrow {
  color: #D4D4D4;
  flex-shrink: 0;
  transition: color 0.12s, transform 0.12s;
}
.wf-picker-row:hover .wf-picker-row-arrow {
  color: var(--brand);
  transform: translateX(2px);
}

/* 新建表单 */
.wf-picker-form {
  padding: 12px 6px 4px;
}
.wf-form-row {
  margin-bottom: 14px;
}
.wf-form-row > label {
  display: block;
  font-size: 0.71875rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.wf-req { color: var(--status-error); }
.wf-form-input {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  font-size: 0.78125rem;
  background: var(--bg-default);
  border: 1px solid rgba(115,115,115,0.14);
  border-radius: 8px;
  outline: none;
  transition: all 0.12s;
  box-sizing: border-box;
}
.wf-form-input:focus {
  border-color: rgba(75,63,227,0.4);
  box-shadow: 0 0 0 3px rgba(75,63,227,0.08);
}
.wf-form-types {
  display: flex;
  gap: 6px;
}
.wf-form-type-btn {
  flex: 1;
  height: 32px;
  font-size: 0.71875rem;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-default);
  border: 1px solid rgba(115,115,115,0.14);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-form-type-btn:hover { background: rgba(115,115,115,0.04); color: var(--text-secondary); }
.wf-type-active {
  background: rgba(75,63,227,0.08) !important;
  color: var(--brand) !important;
  border-color: rgba(75,63,227,0.3) !important;
}
.wf-form-submit {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.78125rem;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
  margin-top: 6px;
}
.wf-form-submit:hover { background: var(--brand-active); }

/* 过渡动画 */
.wf-picker-enter-active, .wf-picker-leave-active {
  transition: opacity 0.15s;
}
.wf-picker-enter-active .wf-picker-panel,
.wf-picker-leave-active .wf-picker-panel {
  transition: transform 0.18s cubic-bezier(0.34, 1.36, 0.64, 1), opacity 0.15s;
}
.wf-picker-enter-from, .wf-picker-leave-to {
  opacity: 0;
}
.wf-picker-enter-from .wf-picker-panel,
.wf-picker-leave-to .wf-picker-panel {
  transform: scale(0.94) translateY(8px);
  opacity: 0;
}

/* 窄屏适配 */
@media (max-width: 520px) {
  .wf-picker-panel { max-width: 100%; max-height: 90vh; border-radius: 12px; }
  .wf-picker-tab { padding: 0 4px; }
  .wf-picker-tab > span:not(.wf-tab-count) { display: none; }
  .wf-picker-tab .wf-tab-count { display: none; }
}
</style>
