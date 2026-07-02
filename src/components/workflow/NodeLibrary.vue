<script setup>
/**
 * NodeLibrary.vue —— 左侧节点库
 *
 * 参考 Dify / Coze / n8n 的节点库面板：
 *   - 分类（智能体 / 工具 / IO）
 *   - 搜索过滤
 *   - 统一图标
 *   - 点击或拖拽到画布新增节点
 */
import { ref, computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useAgentStore, AVAILABLE_TOOLS } from '@/stores/agents'
import { useToastStore } from '@/stores/toast'
import Icon from '@/components/Icon.vue'

const workflow = useWorkflowStore()
const agents = useAgentStore()
const toast = useToastStore()

const query = ref('')
const activeCategory = ref('all') // all | agent | tool | io

const categories = [
  { id: 'all',   label: '全部',   icon: 'grid' },
  { id: 'agent', label: '智能体', icon: 'spark' },
  { id: 'tool',  label: '工具',   icon: 'tool' },
  { id: 'io',    label: '输入输出', icon: 'arrowR' }
]

// 智能体节点项（从 agents store 派生）
const agentItems = computed(() => agents.list.map(a => ({
  id: a.id,
  type: 'agent',
  label: a.name,
  desc: a.desc,
  icon: 'spark',
  color: a.color,
  meta: a.type
})))

// 工具节点项
const toolItems = AVAILABLE_TOOLS.map(t => ({
  id: t.id,
  type: 'tool',
  label: t.label,
  desc: t.desc,
  icon: 'tool',
  color: '#2F74FF',
  meta: t.id
}))

// IO 节点项
const ioItems = [
  { id: 'io-start', type: 'io', label: '开始', desc: '工作流入口', icon: 'arrowR', color: '#6A6FFF', meta: 'start' },
  { id: 'io-end', type: 'io', label: '结束', desc: '工作流出口', icon: 'arrowR', color: '#6A6FFF', meta: 'end' }
]

const allItems = computed(() => [...agentItems.value, ...toolItems, ...ioItems])

const filtered = computed(() => {
  let list = allItems.value
  if (activeCategory.value !== 'all') {
    list = list.filter(i => i.type === activeCategory.value)
  }
  if (query.value.trim()) {
    const k = query.value.toLowerCase()
    list = list.filter(i => i.label.toLowerCase().includes(k) || i.desc.toLowerCase().includes(k))
  }
  return list
})

// 点击添加节点到画布
function addNode(item) {
  if (item.type === 'agent') {
    // 智能体：如果画布已有该 id 节点，选中而非重复添加
    if (workflow.nodes.find(n => n.id === item.id)) {
      workflow.selectNode(item.id)
      toast.push(`「${item.label}」已在画布中`, 'info')
      return
    }
    workflow.addNode({
      id: item.id,
      type: 'agent',
      label: item.label,
      x: 200 + Math.random() * 100,
      y: 100 + Math.random() * 100,
      w: 200,
      h: 84
    })
    toast.push(`已添加「${item.label}」到画布`, 'success')
  } else if (item.type === 'tool') {
    const newId = 'tool-' + Date.now()
    workflow.addNode({
      id: newId,
      type: 'tool',
      label: item.label,
      toolId: item.id,
      x: 200 + Math.random() * 100,
      y: 200 + Math.random() * 100,
      w: 180,
      h: 64
    })
    toast.push(`已添加工具「${item.label}」`, 'success')
  } else if (item.type === 'io') {
    const newId = (item.meta === 'start' ? 'io1' : 'io2')
    if (workflow.nodes.find(n => n.id === newId)) {
      toast.push(`${item.label}节点已存在`, 'info')
      return
    }
    workflow.addNode({
      id: newId,
      type: 'io',
      label: item.label,
      x: 24,
      y: 120,
      w: 40,
      h: 40
    })
    toast.push(`已添加${item.label}节点`, 'success')
  }
}

// 拖拽到画布（HTML5 drag）
function onDragStart(e, item) {
  e.dataTransfer.setData('application/x-wf-node', JSON.stringify({
    id: item.id,
    type: item.type,
    label: item.label,
    toolId: item.meta,
    color: item.color
  }))
  e.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <div class="wf-library">
    <!-- 标题 -->
    <div class="wf-library-header">
      <div class="wf-library-title">节点库</div>
      <span class="wf-library-count">{{ allItems.length }}</span>
    </div>

    <!-- 搜索框 -->
    <div class="wf-search-wrap">
      <Icon name="search" :size="14" class="wf-search-icon" />
      <input
        v-model="query"
        class="wf-search-input"
        placeholder="搜索节点…"
      />
      <button v-if="query" class="wf-search-clear" @click="query = ''">
        <Icon name="close" :size="12" />
      </button>
    </div>

    <!-- 分类 tabs -->
    <div class="wf-categories">
      <button
        v-for="c in categories" :key="c.id"
        @click="activeCategory = c.id"
        :class="['wf-cat-btn', activeCategory === c.id ? 'wf-cat-active' : '']"
      >
        <Icon :name="c.icon" :size="13" />
        <span>{{ c.label }}</span>
      </button>
    </div>

    <!-- 节点列表 -->
    <div class="wf-lib-list">
      <div v-if="!filtered.length" class="wf-lib-empty">
        <Icon name="search" :size="24" class="text-grey-300 mx-auto mb-2" />
        <p>没有匹配的节点</p>
      </div>
      <div
        v-for="item in filtered" :key="item.type + item.id"
        class="wf-lib-item"
        draggable="true"
        @dragstart="onDragStart($event, item)"
        @click="addNode(item)"
      >
        <div
          class="wf-lib-item-icon"
          :style="{ background: item.color + '15', color: item.color }"
        >
          <Icon :name="item.icon" :size="15" />
        </div>
        <div class="wf-lib-item-body">
          <div class="wf-lib-item-label">{{ item.label }}</div>
          <div class="wf-lib-item-desc">{{ item.desc }}</div>
        </div>
        <span class="wf-lib-item-type">{{ item.type === 'agent' ? '智能体' : item.type === 'tool' ? '工具' : 'IO' }}</span>
      </div>
    </div>

    <!-- 底部提示 -->
    <div class="wf-lib-footer">
      <Icon name="info" :size="12" />
      <span>点击或拖拽添加到画布</span>
    </div>
  </div>
</template>

<style scoped>
.wf-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-default);
}
.wf-library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--overlay-l1);
}
.wf-library-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.wf-library-count {
  font-size: 0.6875rem;
  color: var(--text-disabled);
  font-family: 'JetBrains Mono', monospace;
  background: rgba(115,115,115,0.06);
  padding: 1px 7px;
  border-radius: 10px;
}

/* 搜索框 */
.wf-search-wrap {
  position: relative;
  padding: 10px 14px 8px;
}
.wf-search-icon {
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-disabled);
  pointer-events: none;
}
.wf-search-input {
  width: 100%;
  height: 30px;
  padding: 0 10px 0 30px;
  font-size: 0.78125rem;
  background: rgba(115,115,115,0.05);
  border: 1px solid rgba(115,115,115,0.1);
  border-radius: 8px;
  outline: none;
  transition: all 0.12s;
}
.wf-search-input::placeholder { color: var(--text-disabled); }
.wf-search-input:focus {
  background: var(--bg-default);
  border-color: rgba(75,63,227,0.4);
  box-shadow: 0 0 0 3px rgba(75,63,227,0.08);
}
.wf-search-clear {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-disabled);
  cursor: pointer;
  padding: 2px;
}
.wf-search-clear:hover { color: var(--text-secondary); }

/* 分类 */
.wf-categories {
  display: flex;
  gap: 4px;
  padding: 0 14px 10px;
  border-bottom: 1px solid var(--overlay-l1);
}
.wf-cat-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s;
}
.wf-cat-btn:hover { background: rgba(115,115,115,0.06); color: var(--text-secondary); }
.wf-cat-active {
  background: rgba(75,63,227,0.08) !important;
  color: var(--brand) !important;
  border-color: rgba(75,63,227,0.2) !important;
}

/* 列表 */
.wf-lib-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}
.wf-lib-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-disabled);
  font-size: 0.75rem;
}
.wf-lib-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: grab;
  transition: background 0.12s, border-color 0.12s;
  border: 1px solid transparent;
}
.wf-lib-item:hover {
  background: rgba(115,115,115,0.04);
  border-color: rgba(115,115,115,0.1);
}
.wf-lib-item:active { cursor: grabbing; }
.wf-lib-item-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wf-lib-item-body {
  flex: 1;
  min-width: 0;
}
.wf-lib-item-label {
  font-size: 0.78125rem;
  font-weight: 500;
  color: var(--text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-lib-item-desc {
  font-size: 0.6875rem;
  color: var(--text-disabled);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-lib-item-type {
  font-size: 9.5px;
  color: var(--text-disabled);
  background: rgba(115,115,115,0.06);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* 底部 */
.wf-lib-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 0.6875rem;
  color: var(--text-disabled);
  border-top: 1px solid var(--overlay-l1);
}
</style>
