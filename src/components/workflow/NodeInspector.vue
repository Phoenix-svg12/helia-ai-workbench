<script setup>
/**
 * NodeInspector.vue —— 右侧节点属性配置面板
 *
 * 参考 Dify / Coze 的属性面板：
 *   - 分组（基础信息 / 人格设定 / 行为参数 / 知识库 / 工具 / 自主度）
 *   - 表单对齐规范（label 左 + 控件右）
 *   - 信息密度优化（可折叠分组）
 *   - 智能体节点：完整配置
 *   - 工具节点：工具配置
 *   - IO 节点：基础信息
 *   - 连线选中：显示连线信息 + 删除按钮
 */
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useAgentStore, AVAILABLE_TOOLS, AUTONOMY_LEVELS } from '@/stores/agents'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useToastStore } from '@/stores/toast'
import Icon from '@/components/Icon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const workflow = useWorkflowStore()
const agents = useAgentStore()
const knowledge = useKnowledgeStore()
const toast = useToastStore()

// 折叠分组状态
const collapsed = ref({ base: false, persona: false, behavior: false, kb: true, tools: true, autonomy: false })

function toggleGroup(g) { collapsed.value[g] = !collapsed.value[g] }

// 当前选中节点对应的智能体对象（如果是 agent 类型）
const selectedAgent = computed(() => {
  if (!workflow.selectedNode || workflow.selectedNode.type !== 'agent') return null
  return agents.list.find(a => a.id === workflow.selectedNode.id) || null
})

// 当前选中连线信息
const selectedEdgeInfo = computed(() => {
  if (!workflow.selectedEdgeKey) return null
  const [from, to] = workflow.selectedEdgeKey.split('->')
  const fromNode = workflow.nodes.find(n => n.id === from)
  const toNode = workflow.nodes.find(n => n.id === to)
  return {
    from: fromNode?.label || from,
    to: toNode?.label || to,
    fromId: from,
    toId: to
  }
})

// 推荐问题文本双向绑定
const questionsText = computed({
  get: () => (selectedAgent.value?.suggestedQuestions || []).join('\n'),
  set: (v) => {
    if (!selectedAgent.value) return
    const arr = v.split('\n').map(s => s.trim()).filter(Boolean)
    agents.update(selectedAgent.value.id, { suggestedQuestions: arr })
  }
})

function patchAgent(patch) {
  if (!selectedAgent.value) return
  agents.update(selectedAgent.value.id, patch)
}

function patchNode(patch) {
  if (!workflow.selectedNode) return
  workflow.updateNode(workflow.selectedNode.id, patch)
}

function toggleKb(kbId) {
  if (!selectedAgent.value) return
  // 临时切换 selectedId 以复用 toggleKnowledgeBase
  const prev = agents.selectedId
  agents.select(selectedAgent.value.id)
  agents.toggleKnowledgeBase(kbId)
  agents.select(prev)
}

const showDelConfirm = ref(false)

function removeCurrentNode() {
  if (!workflow.selectedNode) return
  showDelConfirm.value = true
}
function confirmRemoveNode() {
  if (!workflow.selectedNode) return
  workflow.removeNode(workflow.selectedNode.id)
  toast.push('已删除节点', 'info')
}

function deleteEdge() {
  if (!selectedEdgeInfo.value) return
  workflow.removeEdge(selectedEdgeInfo.value.fromId, selectedEdgeInfo.value.toId)
  toast.push('已删除连线', 'info')
}
</script>

<template>
  <div class="wf-inspector">
    <!-- 头部 -->
    <div class="wf-ins-header">
      <div class="wf-ins-title">
        <Icon name="info" :size="14" />
        <span>属性配置</span>
      </div>
    </div>

    <!-- 无选中态 -->
    <div v-if="!workflow.selectedNode && !selectedEdgeInfo" class="wf-ins-empty">
      <div class="wf-ins-empty-icon"><Icon name="spark" :size="28" /></div>
      <p class="wf-ins-empty-title">未选中节点</p>
      <p class="wf-ins-empty-desc">点击画布上的节点查看并编辑属性</p>
    </div>

    <!-- 连线选中态 -->
    <div v-else-if="selectedEdgeInfo" class="wf-ins-edge">
      <div class="wf-ins-edge-card">
        <div class="wf-ins-edge-row">
          <span class="wf-ins-edge-label">起点</span>
          <span class="wf-ins-edge-value">{{ selectedEdgeInfo.from }}</span>
        </div>
        <div class="wf-ins-edge-flow">
          <Icon name="arrowDown" :size="14" />
        </div>
        <div class="wf-ins-edge-row">
          <span class="wf-ins-edge-label">终点</span>
          <span class="wf-ins-edge-value">{{ selectedEdgeInfo.to }}</span>
        </div>
      </div>
      <button class="wf-ins-edge-del" @click="deleteEdge">
        <Icon name="trash" :size="14" />
        删除连线
      </button>
    </div>

    <!-- 节点选中态 -->
    <div v-else-if="workflow.selectedNode" class="wf-ins-body">
      <!-- 分组：基础信息 -->
      <div class="wf-group">
        <button class="wf-group-head" @click="toggleGroup('base')">
          <Icon name="chevR" :size="12" :class="collapsed.base ? 'wf-collapsed' : ''" class="wf-chevron" />
          <span>基础信息</span>
        </button>
        <div v-show="!collapsed.base" class="wf-group-body">
          <div class="wf-field">
            <label for="field-node-label">节点名称</label>
            <input
              id="field-node-label"
              :value="workflow.selectedNode.label"
              @input="patchNode({ label: $event.target.value })"
              class="wf-input"
            />
          </div>
          <div class="wf-field">
            <label>类型</label>
            <span class="wf-readonly">{{
              workflow.selectedNode.type === 'agent' ? '智能体'
              : workflow.selectedNode.type === 'tool' ? '工具'
              : '输入输出'
            }}</span>
          </div>
          <div class="wf-field">
            <label>位置</label>
            <span class="wf-readonly font-mono">{{ Math.round(workflow.selectedNode.x) }}, {{ Math.round(workflow.selectedNode.y) }}</span>
          </div>
        </div>
      </div>

      <!-- 智能体专属配置 -->
      <template v-if="selectedAgent">
        <!-- 分组：人格设定 -->
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('persona')">
            <Icon name="chevR" :size="12" :class="collapsed.persona ? 'wf-collapsed' : ''" class="wf-chevron" />
            <span>人格设定</span>
          </button>
          <div v-show="!collapsed.persona" class="wf-group-body">
            <div class="wf-field wf-field-col">
              <label for="field-system-prompt">System Prompt</label>
              <textarea
                id="field-system-prompt"
                :value="selectedAgent.systemPrompt"
                @input="patchAgent({ systemPrompt: $event.target.value })"
                class="wf-textarea font-mono"
                rows="5"
                placeholder="定义智能体的人设与回复逻辑"
              ></textarea>
            </div>
            <div class="wf-field wf-field-col">
              <label for="field-greeting">开场白</label>
              <textarea
                id="field-greeting"
                :value="selectedAgent.greeting"
                @input="patchAgent({ greeting: $event.target.value })"
                class="wf-textarea"
                rows="2"
                placeholder="对话首次进入时显示"
              ></textarea>
            </div>
            <div class="wf-field wf-field-col">
              <label for="field-suggested-questions">推荐问题（每行一个）</label>
              <textarea
                id="field-suggested-questions"
                v-model="questionsText"
                class="wf-textarea"
                rows="3"
                placeholder="每行一个问题"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 分组：行为参数 -->
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('behavior')">
            <Icon name="chevR" :size="12" :class="collapsed.behavior ? 'wf-collapsed' : ''" class="wf-chevron" />
            <span>行为参数</span>
          </button>
          <div v-show="!collapsed.behavior" class="wf-group-body">
            <div class="wf-field">
              <label for="field-temperature">Temperature</label>
              <div class="wf-slider-wrap">
                <input
                  id="field-temperature"
                  type="range" min="0" max="1" step="0.05"
                  :value="selectedAgent.temperature ?? 0.5"
                  @input="patchAgent({ temperature: parseFloat($event.target.value) })"
                  class="wf-slider"
                />
                <span class="wf-slider-val">{{ (selectedAgent.temperature ?? 0.5).toFixed(2) }}</span>
              </div>
            </div>
            <div class="wf-field">
              <label for="field-agent-type">智能体类型</label>
              <select
                id="field-agent-type"
                :value="selectedAgent.type"
                @change="patchAgent({ type: $event.target.value })"
                class="wf-input"
              >
                <option value="对话型">对话型</option>
                <option value="工作流型">工作流型</option>
                <option value="工具型">工具型</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 分组：自主度 -->
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('autonomy')">
            <Icon name="chevR" :size="12" :class="collapsed.autonomy ? 'wf-collapsed' : ''" class="wf-chevron" />
            <span>自主度 · Helia 审批</span>
          </button>
          <div v-show="!collapsed.autonomy" class="wf-group-body">
            <div class="wf-autonomy-grid">
              <button
                v-for="lvl in AUTONOMY_LEVELS" :key="lvl.id"
                @click="patchAgent({ autonomy: lvl.id })"
                :class="['wf-autonomy-btn', selectedAgent.autonomy === lvl.id ? 'wf-autonomy-active' : '']"
                :title="lvl.desc"
              >
                <div class="wf-autonomy-label">{{ lvl.label }}</div>
                <div class="wf-autonomy-desc">{{ lvl.desc }}</div>
              </button>
            </div>
          </div>
        </div>

        <!-- 分组：知识库 -->
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('kb')">
            <Icon name="chevR" :size="12" :class="collapsed.kb ? 'wf-collapsed' : ''" class="wf-chevron" />
            <span>知识库绑定</span>
            <span class="wf-group-count">{{ selectedAgent.knowledgeBaseIds?.length || 0 }}</span>
          </button>
          <div v-show="!collapsed.kb" class="wf-group-body">
            <div v-if="!knowledge.documents.length" class="wf-empty-hint">
              暂无知识库文档，请到「知识库」页面上传
            </div>
            <div v-else class="wf-kb-list">
              <label
                v-for="d in knowledge.documents" :key="d.id"
                class="wf-kb-item"
              >
                <input
                  type="checkbox"
                  :checked="selectedAgent.knowledgeBaseIds?.includes(d.id)"
                  @change="toggleKb(d.id)"
                  class="wf-checkbox"
                />
                <Icon name="doc" :size="13" class="text-grey-500" />
                <span class="wf-kb-name">{{ d.name }}</span>
                <span class="wf-kb-chunks">{{ d.chunks?.length || 0 }} 块</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 分组：工具 -->
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('tools')">
            <Icon name="chevR" :size="12" :class="collapsed.tools ? 'wf-collapsed' : ''" class="wf-chevron" />
            <span>可用工具</span>
            <span class="wf-group-count">{{ selectedAgent.tools?.length || 0 }}</span>
          </button>
          <div v-show="!collapsed.tools" class="wf-group-body">
            <div class="wf-tools-grid">
              <label
                v-for="t in AVAILABLE_TOOLS" :key="t.id"
                class="wf-tool-item"
              >
                <input
                  type="checkbox"
                  :checked="selectedAgent.tools?.includes(t.id)"
                  @change="() => {
                    const tools = [...(selectedAgent.tools || [])]
                    const i = tools.indexOf(t.id)
                    if (i >= 0) tools.splice(i, 1)
                    else tools.push(t.id)
                    patchAgent({ tools })
                  }"
                  class="wf-checkbox"
                />
                <Icon :name="t.icon === 'search' ? 'search' : t.icon === 'code' ? 'code' : t.icon === 'book' ? 'book' : 'grid'" :size="14" />
                <div class="wf-tool-body">
                  <div class="wf-tool-label">{{ t.label }}</div>
                  <div class="wf-tool-desc">{{ t.desc }}</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </template>

      <!-- 工具节点配置 -->
      <template v-else-if="workflow.selectedNode.type === 'tool'">
        <div class="wf-group">
          <button class="wf-group-head" @click="toggleGroup('base')">
            <Icon name="chevR" :size="12" class="wf-chevron" />
            <span>工具配置</span>
          </button>
          <div class="wf-group-body">
            <div class="wf-field">
              <label>工具 ID</label>
              <span class="wf-readonly font-mono">{{ workflow.selectedNode.toolId || '未设置' }}</span>
            </div>
            <div class="wf-field">
              <label for="field-tool-select">选择工具</label>
              <select
                id="field-tool-select"
                :value="workflow.selectedNode.toolId"
                @change="patchNode({ toolId: $event.target.value })"
                class="wf-input"
              >
                <option v-for="t in AVAILABLE_TOOLS" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </template>

      <!-- 统计 -->
      <div v-if="selectedAgent" class="wf-group">
        <button class="wf-group-head" @click="toggleGroup('stats')">
          <Icon name="chevR" :size="12" class="wf-chevron" />
          <span>调用统计</span>
        </button>
        <div v-show="!collapsed.stats" class="wf-group-body">
          <div class="wf-stats-grid">
            <div class="wf-stat-item">
              <div class="wf-stat-label">调用次数</div>
              <div class="wf-stat-value">{{ (selectedAgent.runs || 0).toLocaleString() }}</div>
            </div>
            <div class="wf-stat-item">
              <div class="wf-stat-label">平均时延</div>
              <div class="wf-stat-value">{{ selectedAgent.avg || '—' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除按钮 -->
      <div class="wf-ins-actions">
        <button
          v-if="workflow.selectedNode.type !== 'io'"
          class="wf-ins-del"
          @click="removeCurrentNode"
        >
          <Icon name="trash" :size="14" />
          删除此节点
        </button>
      </div>
    </div>

    <!-- 删除节点确认弹窗 -->
    <ConfirmDialog
      v-model="showDelConfirm"
      title="删除节点"
      :desc="workflow.selectedNode ? `删除节点「${workflow.selectedNode.label}」？此操作不可撤销。` : ''"
      confirm-text="删除"
      danger
      @confirm="confirmRemoveNode"
    />
  </div>
</template>

<style scoped>
.wf-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-default);
}
.wf-ins-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--overlay-l1);
}
.wf-ins-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* 空状态 */
.wf-ins-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}
.wf-ins-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(75,63,227,0.06);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.wf-ins-empty-title { font-size: 0.8125rem; color: var(--text-secondary); font-weight: 500; margin: 0; }
.wf-ins-empty-desc { font-size: 0.71875rem; color: var(--text-disabled); margin-top: 4px; }

/* 连线信息 */
.wf-ins-edge { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.wf-ins-edge-card {
  background: rgba(75,63,227,0.04);
  border: 1px solid rgba(75,63,227,0.15);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.wf-ins-edge-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.wf-ins-edge-label { font-size: 0.625rem; color: var(--text-disabled); text-transform: uppercase; letter-spacing: 0.06em; }
.wf-ins-edge-value { font-size: 0.8125rem; color: var(--text-default); font-weight: 500; }
.wf-ins-edge-flow { color: var(--brand); }
.wf-ins-edge-del {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: center;
  height: 32px;
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--status-error);
  border: 1px solid rgba(232,70,58,0.2);
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.wf-ins-edge-del:hover { background: rgba(232,70,58,0.06); }

/* body */
.wf-ins-body { flex: 1; overflow-y: auto; padding: 8px 0 16px; }

/* 分组 */
.wf-group { border-bottom: 1px solid rgba(115,115,115,0.06); }
.wf-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.12s;
}
.wf-group-head:hover { background: rgba(115,115,115,0.03); }
.wf-chevron { transition: transform 0.15s; color: var(--text-disabled); }
.wf-chevron:not(.wf-collapsed) { transform: rotate(90deg); }
.wf-collapsed { transform: rotate(0deg); }
.wf-group-count {
  margin-left: auto;
  font-size: 0.6875rem;
  color: var(--text-disabled);
  background: rgba(115,115,115,0.06);
  padding: 1px 7px;
  border-radius: 10px;
  font-family: 'JetBrains Mono', monospace;
}
.wf-group-body { padding: 4px 16px 12px; }

/* 表单 */
.wf-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
}
.wf-field-col { flex-direction: column; align-items: stretch; gap: 6px; }
.wf-field > label {
  font-size: 0.71875rem;
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 70px;
}
.wf-field-col > label { min-width: 0; }
.wf-input, .wf-textarea {
  flex: 1;
  background: var(--bg-default);
  border: 1px solid var(--border-neutral-l1);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.75rem;
  color: var(--text-default);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
  min-width: 0;
}
.wf-textarea { resize: vertical; line-height: 1.5; font-family: inherit; }
.wf-input:focus, .wf-textarea:focus {
  border-color: rgba(75,63,227,0.4);
  box-shadow: 0 0 0 3px rgba(75,63,227,0.08);
}
.wf-readonly { font-size: 0.75rem; color: var(--text-secondary); }
.font-mono { font-family: 'JetBrains Mono', monospace; }

/* slider */
.wf-slider-wrap { display: flex; align-items: center; gap: 8px; flex: 1; }
.wf-slider { flex: 1; accent-color: var(--brand); height: 4px; }
.wf-slider-val {
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
  min-width: 32px;
  text-align: right;
}

/* 自主度 */
.wf-autonomy-grid { display: flex; flex-direction: column; gap: 6px; }
.wf-autonomy-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-neutral-l1);
  background: var(--bg-default);
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
}
.wf-autonomy-btn:hover { border-color: rgba(75,63,227,0.3); background: rgba(75,63,227,0.02); }
.wf-autonomy-active {
  border-color: var(--brand) !important;
  background: rgba(75,63,227,0.06) !important;
}
.wf-autonomy-label { font-size: 0.75rem; font-weight: 600; color: var(--text-default); }
.wf-autonomy-active .wf-autonomy-label { color: var(--brand); }
.wf-autonomy-desc { font-size: 0.6875rem; color: var(--text-tertiary); }

/* 知识库 */
.wf-empty-hint {
  font-size: 0.71875rem;
  color: var(--text-disabled);
  font-style: italic;
  background: rgba(115,115,115,0.04);
  padding: 10px;
  border-radius: 8px;
  text-align: center;
}
.wf-kb-list { display: flex; flex-direction: column; gap: 4px; }
.wf-kb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.wf-kb-item:hover { background: rgba(115,115,115,0.04); }
.wf-kb-name { flex: 1; font-size: 0.75rem; color: var(--text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-kb-chunks { font-size: 0.625rem; color: var(--text-disabled); font-family: 'JetBrains Mono', monospace; }
.wf-checkbox { accent-color: var(--brand); width: 14px; height: 14px; cursor: pointer; }

/* 工具 */
.wf-tools-grid { display: flex; flex-direction: column; gap: 6px; }
.wf-tool-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(115,115,115,0.1);
  cursor: pointer;
  transition: all 0.12s;
}
.wf-tool-item:hover { border-color: rgba(75,63,227,0.25); background: rgba(75,63,227,0.02); }
.wf-tool-body { flex: 1; }
.wf-tool-label { font-size: 0.75rem; font-weight: 500; color: var(--text-default); }
.wf-tool-desc { font-size: 0.6875rem; color: var(--text-disabled); margin-top: 1px; }

/* 统计 */
.wf-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wf-stat-item {
  background: rgba(115,115,115,0.04);
  border-radius: 8px;
  padding: 10px;
}
.wf-stat-label { font-size: 0.625rem; color: var(--text-disabled); text-transform: uppercase; letter-spacing: 0.06em; }
.wf-stat-value { font-size: 1rem; font-weight: 600; color: var(--text-default); margin-top: 2px; }

/* 操作 */
.wf-ins-actions { padding: 12px 16px; }
.wf-ins-del {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 30px;
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--status-error);
  border: 1px solid rgba(232,70,58,0.2);
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.wf-ins-del:hover { background: rgba(232,70,58,0.06); }
</style>
