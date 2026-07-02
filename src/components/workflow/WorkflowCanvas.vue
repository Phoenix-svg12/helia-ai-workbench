<script setup>
/**
 * WorkflowCanvas.vue —— 工作流画布组件
 *
 * 参考 Dify / Coze / n8n / LangFlow 的画布交互：
 *   - 滚轮缩放（以鼠标位置为中心）/ 按钮缩放 / 拖拽平移 / 双击复位
 *   - 节点文字完整展示不截断（节点宽度自适应 + 换行）
 *   - 节点间「+」连接按钮：点击连线中点的 + 可快速插入新节点并自动连接
 *   - 连线高亮选中 + 路径追踪（选中节点时高亮其上下游链路）
 *   - 贝塞尔曲线美化，选中/高亮态加粗变色
 *   - 节点拖拽移动（写回 workflow.moveNode）
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useAgentStore } from '@/stores/agents'
import { useToastStore } from '@/stores/toast'
import Icon from '@/components/Icon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AddNodePicker from './AddNodePicker.vue'
import NodePort from './NodePort.vue'

const workflow = useWorkflowStore()
const agents = useAgentStore()
const toast = useToastStore()

const canvasEl = ref(null)       // 外层容器（监听滚轮/拖拽平移）
const viewportEl = ref(null)     // 内层 transform 容器

// 节点拖拽状态
const dragging = ref(null)       // { id, offsetX, offsetY }
// 画布平移状态
const panning = ref(null)        // { startX, startY, panX, panY }
// 连线中点的 + 按钮悬浮态
const hoverEdgeIdx = ref(null)

// 画布坐标转屏幕坐标（考虑 zoom + pan）
function worldToScreen(x, y) {
  return {
    x: x * workflow.viewport.zoom + workflow.viewport.panX,
    y: y * workflow.viewport.zoom + workflow.viewport.panY
  }
}

// 节点中心点（世界坐标）
function nodeCenter(n) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 }
}

// 边的贝塞尔 path（屏幕坐标，带箭头方向）
const edgePaths = computed(() => {
  return workflow.edges.map((e) => {
    const f = workflow.nodes.find(n => n.id === e.from)
    const t = workflow.nodes.find(n => n.id === e.to)
    if (!f || !t) return { d: '', mid: { x: 0, y: 0 }, key: '', from: e.from, to: e.to }
    const fc = nodeCenter(f)
    const tc = nodeCenter(t)
    // 出口点：源节点右边界中点
    const fx = f.x + f.w
    const fy = fc.y
    // 入口点：目标节点左边界中点
    const tx = t.x
    const ty = tc.y
    const dx = Math.max(40, Math.abs(tx - fx) * 0.4)
    const d = `M ${fx} ${fy} C ${fx + dx} ${fy}, ${tx - dx} ${ty}, ${tx} ${ty}`
    const mid = { x: (fx + tx) / 2, y: (fy + ty) / 2 }
    return { d, mid, key: e.from + '->' + e.to, from: e.from, to: e.to }
  })
})

// 节点颜色
function nodeColor(n) {
  if (n.type === 'agent') {
    return agents.list.find(a => a.id === n.id)?.color || '#4B3FE3'
  }
  if (n.type === 'tool') return '#2F74FF'
  return '#6A6FFF' // io
}

// 缓存节点对应的 agent 信息，避免 v-for 内重复 .find()
const agentMap = computed(() => {
  const m = new Map()
  agents.list.forEach(a => m.set(a.id, a))
  return m
})
function agentOf(nodeId) {
  return agentMap.value.get(nodeId)
}
function skillsOf(nodeId) {
  return (agentMap.value.get(nodeId)?.skills || []).slice(0, 3)
}

// ===== 滚轮缩放（以鼠标位置为中心）=====
function onWheel(e) {
  if (!canvasEl.value) return
  e.preventDefault()
  const rect = canvasEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const delta = -e.deltaY * 0.0015
  const oldZoom = workflow.viewport.zoom
  const newZoom = Math.min(2, Math.max(0.3, Math.round((oldZoom + delta) * 100) / 100))
  if (newZoom === oldZoom) return
  // 保持鼠标位置在世界坐标不变：调整 pan（通过 action 写入 activeWorkflow）
  const worldX = (mx - workflow.viewport.panX) / oldZoom
  const worldY = (my - workflow.viewport.panY) / oldZoom
  workflow.setViewport({
    panX: mx - worldX * newZoom,
    panY: my - worldY * newZoom,
    zoom: newZoom
  })
}

// ===== 画布拖拽平移（按住空白区域拖动）=====
function onCanvasPointerDown(e) {
  // 只在点击空白（非节点非边非+）时开始平移
  if (e.target.closest('[data-node]') || e.target.closest('[data-edge-plus]')) return
  panning.value = {
    startX: e.clientX,
    startY: e.clientY,
    panX: workflow.viewport.panX,
    panY: workflow.viewport.panY
  }
  canvasEl.value.style.cursor = 'grabbing'
  window.addEventListener('pointermove', onPanMove)
  window.addEventListener('pointerup', onPanEnd)
  // 点击空白取消选中
  workflow.clearSelection()
}
function onPanMove(e) {
  if (!panning.value) return
  const dx = e.clientX - panning.value.startX
  const dy = e.clientY - panning.value.startY
  workflow.setPan(panning.value.panX + dx, panning.value.panY + dy)
}
function onPanEnd() {
  panning.value = null
  if (canvasEl.value) canvasEl.value.style.cursor = 'default'
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanEnd)
}

// ===== 节点拖拽移动 =====
function onNodePointerDown(e, node) {
  if (node.type === 'io') return
  e.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  const z = workflow.viewport.zoom
  dragging.value = {
    id: node.id,
    offsetX: (e.clientX - rect.left - workflow.viewport.panX) / z - node.x,
    offsetY: (e.clientY - rect.top - workflow.viewport.panY) / z - node.y
  }
  workflow.selectNode(node.id)
  window.addEventListener('pointermove', onNodeMove)
  window.addEventListener('pointerup', onNodeUp)
}
function onNodeMove(e) {
  const d = dragging.value
  if (!d || !canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const z = workflow.viewport.zoom
  const node = workflow.nodes.find(n => n.id === d.id)
  if (!node) return
  const maxX = 2000
  const maxY = 1600
  const x = Math.min(Math.max(-100, (e.clientX - rect.left - workflow.viewport.panX) / z - d.offsetX), maxX)
  const y = Math.min(Math.max(-100, (e.clientY - rect.top - workflow.viewport.panY) / z - d.offsetY), maxY)
  workflow.moveNode(d.id, x, y)
}
function onNodeUp() {
  dragging.value = null
  window.removeEventListener('pointermove', onNodeMove)
  window.removeEventListener('pointerup', onNodeUp)
}

// ===== 连线中点 + 按钮：快速插入新节点 =====
function addNodeOnEdge(edge) {
  // 在 from 和 to 之间插入一个新节点，自动连接
  const fromNode = workflow.nodes.find(n => n.id === edge.from)
  const toNode = workflow.nodes.find(n => n.id === edge.to)
  if (!fromNode || !toNode) return
  const midX = (fromNode.x + fromNode.w / 2 + toNode.x + toNode.w / 2) / 2 - 90
  const midY = (fromNode.y + fromNode.h / 2 + toNode.y + toNode.h / 2) / 2 - 32
  const newId = 'node-' + Date.now()
  workflow.addNode({
    id: newId,
    type: 'agent',
    label: '新智能体',
    x: midX,
    y: midY,
    w: 200,
    h: 84
  })
  // 删除原边，加两条新边
  workflow.removeEdge(edge.from, edge.to)
  workflow.addEdge(edge.from, newId)
  workflow.addEdge(newId, edge.to)
  workflow.selectNode(newId)
}

// ===== 节点端口 + 按钮（统一双向：in/out 均可拖拽连线 + 点击添加）=====
// 弹窗状态
const showPicker = ref(false)
const pickerNodeId = ref('')
const pickerSide = ref('out') // 'out' = 添加下游 | 'in' = 添加上游

function openPicker({ node, side }) {
  pickerNodeId.value = node.id
  pickerSide.value = side
  showPicker.value = true
}

// 弹窗选择后回调：根据 side 决定节点放置方向 + 连线方向
function onPickerAdd(item) {
  const curNode = workflow.nodes.find(n => n.id === pickerNodeId.value)
  if (!curNode) return
  const isOut = pickerSide.value === 'out'
  // 新节点位置：out → 右侧；in → 左侧
  const newX = isOut ? curNode.x + curNode.w + 60 : curNode.x - 260
  const newY = curNode.y

  if (item.kind === 'agent') {
    // 已在画布上：只连线
    if (workflow.nodes.find(n => n.id === item.id)) {
      if (isOut) workflow.addEdge(curNode.id, item.id)
      else workflow.addEdge(item.id, curNode.id)
      toast.push(`已连接到「${item.label}」`, 'success')
      return
    }
    workflow.addNode({
      id: item.id,
      type: 'agent',
      label: item.label,
      x: newX,
      y: newY,
      w: 200,
      h: 84
    })
  } else if (item.kind === 'tool') {
    workflow.addNode({
      id: item.id,
      type: 'tool',
      label: item.label,
      toolId: item.toolId,
      x: newX,
      y: newY,
      w: 180,
      h: 64
    })
  }
  // 连线方向：out → curNode→new；in → new→curNode
  if (isOut) workflow.addEdge(curNode.id, item.id)
  else workflow.addEdge(item.id, curNode.id)
  workflow.selectNode(item.id)
  toast.push(`已添加「${item.label}」`, 'success')
}

// ===== 节点删除 =====
const showDelNodeConfirm = ref(false)
const pendingDelNode = ref(null)

function deleteNode(node, e) {
  e.stopPropagation()
  if (node.type === 'io') {
    toast.push('IO 节点不可删除', 'warn')
    return
  }
  pendingDelNode.value = node
  showDelNodeConfirm.value = true
}
function confirmDeleteNode() {
  if (!pendingDelNode.value) return
  workflow.removeNode(pendingDelNode.value.id)
  toast.push(`已删除「${pendingDelNode.value.label}」`, 'info')
  pendingDelNode.value = null
}

// 键盘删除：选中节点后按 Delete / Backspace
function onKeyDown(e) {
  // 输入框中不响应
  const tag = (e.target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
  if (!workflow.selectedNodeId) return
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  const node = workflow.nodes.find(n => n.id === workflow.selectedNodeId)
  if (!node || node.type === 'io') return
  e.preventDefault()
  workflow.removeNode(workflow.selectedNodeId)
  toast.push('已删除选中节点', 'info')
}

// ===== 节点端口拖拽连线（in/out 双向，统一处理）=====
// connecting: { side: 'in'|'out', nodeId, curX, curY }
const connecting = ref(null)

function onPortDown({ event, node, side }) {
  event.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  const z = workflow.viewport.zoom
  connecting.value = {
    side,
    nodeId: node.id,
    curX: (event.clientX - rect.left - workflow.viewport.panX) / z,
    curY: (event.clientY - rect.top - workflow.viewport.panY) / z
  }
  window.addEventListener('pointermove', onConnectMove)
  window.addEventListener('pointerup', onConnectUp)
}

function onConnectMove(e) {
  if (!connecting.value || !canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const z = workflow.viewport.zoom
  connecting.value.curX = (e.clientX - rect.left - workflow.viewport.panX) / z
  connecting.value.curY = (e.clientY - rect.top - workflow.viewport.panY) / z
}

function onConnectUp(e) {
  if (!connecting.value) return
  const target = e.target.closest('[data-node]')
  if (target) {
    const targetId = target.getAttribute('data-node-id')
    if (targetId && targetId !== connecting.value.nodeId) {
      if (connecting.value.side === 'out') {
        // 从输出端拖出 → 连接 当前→目标
        workflow.addEdge(connecting.value.nodeId, targetId)
      } else {
        // 从输入端拖出 → 连接 目标→当前
        workflow.addEdge(targetId, connecting.value.nodeId)
      }
    }
  }
  connecting.value = null
  window.removeEventListener('pointermove', onConnectMove)
  window.removeEventListener('pointerup', onConnectUp)
}

// 临时连线路径：根据 side 决定起点/终点
const connectPath = computed(() => {
  if (!connecting.value) return ''
  const node = workflow.nodes.find(n => n.id === connecting.value.nodeId)
  if (!node) return ''
  const cx = connecting.value.curX
  const cy = connecting.value.curY
  if (connecting.value.side === 'out') {
    // 从节点右边界 → 光标
    const fx = node.x + node.w
    const fy = node.y + node.h / 2
    const dx = Math.max(40, Math.abs(cx - fx) * 0.4)
    return `M ${fx} ${fy} C ${fx + dx} ${fy}, ${cx - dx} ${cy}, ${cx} ${cy}`
  } else {
    // 从光标 → 节点左边界
    const tx = node.x
    const ty = node.y + node.h / 2
    const dx = Math.max(40, Math.abs(tx - cx) * 0.4)
    return `M ${cx} ${cy} C ${cx + dx} ${cy}, ${tx - dx} ${ty}, ${tx} ${ty}`
  }
})

// 选中节点的下游/上游集合（路径追踪高亮）
const highlightNodes = computed(() => {
  const set = new Set()
  if (workflow.selectedNodeId) {
    set.add(workflow.selectedNodeId)
    workflow.downstream(workflow.selectedNodeId).forEach(id => set.add(id))
    workflow.upstream(workflow.selectedNodeId).forEach(id => set.add(id))
  }
  return set
})

// 缩放百分比显示
const zoomPct = computed(() => Math.round(workflow.viewport.zoom * 100) + '%')

onMounted(() => {
  if (canvasEl.value) {
    canvasEl.value.addEventListener('wheel', onWheel, { passive: false })
  }
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  if (canvasEl.value) {
    canvasEl.value.removeEventListener('wheel', onWheel)
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanEnd)
  window.removeEventListener('pointermove', onNodeMove)
  window.removeEventListener('pointerup', onNodeUp)
  window.removeEventListener('pointermove', onConnectMove)
  window.removeEventListener('pointerup', onConnectUp)
})

defineExpose({ canvasEl })
</script>

<template>
  <div
    ref="canvasEl"
    class="wf-canvas"
    @pointerdown="onCanvasPointerDown"
    @dblclick="workflow.resetViewport()"
  >
    <!-- 可变换视口层 -->
    <div
      ref="viewportEl"
      class="wf-viewport"
      :style="{
        transform: `translate(${workflow.viewport.panX}px, ${workflow.viewport.panY}px) scale(${workflow.viewport.zoom})`,
        transformOrigin: '0 0'
      }"
    >
      <!-- 连线层（SVG，世界坐标） -->
      <svg class="wf-edges" style="overflow: visible;">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(115,115,115,0.5)" />
          </marker>
          <marker id="wf-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#4B3FE3" />
          </marker>
        </defs>
        <!-- 已有连线 -->
        <path
          v-for="(ep, i) in edgePaths" :key="ep.key"
          :d="ep.d"
          :class="['wf-edge', {
            'wf-edge-active': workflow.isEdgeSelected(ep.from, ep.to),
            'wf-edge-highlight': workflow.selectedNodeId && highlightNodes.has(ep.from) && highlightNodes.has(ep.to)
          }]"
          :marker-end="workflow.isEdgeSelected(ep.from, ep.to) ? 'url(#wf-arrow-active)' : 'url(#wf-arrow)'"
          fill="none"
          @click.stop="workflow.selectEdge(ep.from, ep.to)"
        />
        <!-- 连线中点 + 按钮 -->
        <g
          v-for="(ep, i) in edgePaths" :key="'plus-' + ep.key"
          :transform="`translate(${ep.mid.x}, ${ep.mid.y})`"
          class="wf-edge-plus-group"
          @mouseenter="hoverEdgeIdx = i"
          @mouseleave="hoverEdgeIdx = null"
        >
          <circle
            r="11"
            class="wf-edge-plus-bg"
            :class="{ 'wf-edge-plus-show': hoverEdgeIdx === i }"
            data-edge-plus
            @click.stop="addNodeOnEdge(ep)"
          />
          <path d="M-5,0 L5,0 M0,-5 L0,5" class="wf-edge-plus-icon" :class="{ 'wf-edge-plus-show': hoverEdgeIdx === i }" data-edge-plus />
        </g>
        <!-- 正在拖拽的临时连线 -->
        <path v-if="connectPath" :d="connectPath" class="wf-edge-connecting" fill="none" />
      </svg>

      <!-- 节点层 -->
      <template v-for="n in workflow.nodes" :key="n.id">
        <!-- IO 端点（输入节点有输出端口，输出节点有输入端口） -->
        <div
          v-if="n.type === 'io'"
          :data-node="true"
          :data-node-id="n.id"
          class="wf-node-io"
          :class="{ 'wf-selected': workflow.selectedNodeId === n.id }"
          :style="{ left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' }"
          role="button"
          tabindex="0"
          :aria-label="`${n.label}节点`"
          @click.stop="workflow.selectNode(n.id)"
          @keydown.enter.stop="workflow.selectNode(n.id)"
        >
          <div class="wf-io-dot"></div>
          <span class="wf-io-label">{{ n.label }}</span>
          <!-- 输入 IO 节点：有输出端口 -->
          <NodePort
            v-if="n.direction === 'in' || n.label === '输入'"
            side="out"
            :node="n"
            @port-down="onPortDown"
            @port-add="openPicker"
          />
          <!-- 输出 IO 节点：有输入端口 -->
          <NodePort
            v-else
            side="in"
            :node="n"
            @port-down="onPortDown"
            @port-add="openPicker"
          />
        </div>

        <!-- Agent 节点 -->
        <div
          v-else-if="n.type === 'agent'"
          :data-node="true"
          :data-node-id="n.id"
          class="wf-node wf-node-agent"
          :class="{
            'wf-selected': workflow.selectedNodeId === n.id,
            'wf-highlight': highlightNodes.has(n.id) && workflow.selectedNodeId !== n.id,
            'wf-dragging': dragging?.id === n.id,
            'wf-executing': workflow.executingNodeId === n.id,
            'wf-completed': workflow.completedNodeIds.includes(n.id)
          }"
          :style="{ left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', minHeight: n.h + 'px' }"
          role="button"
          tabindex="0"
          :aria-label="`智能体节点：${agents.list.find(a => a.id === n.id)?.name || n.label}，按 Delete 删除`"
          @pointerdown="onNodePointerDown($event, n)"
          @keydown.delete.prevent="deleteNode(n, $event)"
        >
          <!-- 删除按钮（hover 时显示） -->
          <button class="wf-node-del" title="删除节点" @pointerdown.stop @click="deleteNode(n, $event)">
            <Icon name="close" :size="11" />
          </button>
          <div class="wf-node-header">
            <div class="wf-node-avatar" :style="{ background: nodeColor(n) }">
              {{ (agentOf(n.id)?.name || n.label || '?')[0] }}
            </div>
            <div class="wf-node-title-wrap">
              <div class="wf-node-title">{{ agentOf(n.id)?.name || n.label }}</div>
              <div class="wf-node-type">{{ agentOf(n.id)?.type || '对话型' }}</div>
            </div>
            <span class="wf-node-badge">{{
              agentOf(n.id)?.autonomy === 'suggest' ? '建议'
              : agentOf(n.id)?.autonomy === 'full-auto' ? '自动' : '确认'
            }}</span>
          </div>
          <div class="wf-node-desc">{{ agentOf(n.id)?.desc || '自定义智能体' }}</div>
          <div class="wf-node-skills">
            <span
              v-for="s in skillsOf(n.id)"
              :key="s"
              class="wf-skill-tag"
            >{{ s }}</span>
          </div>
          <!-- 输入端口（左）+ 输出端口（右）：均可拖拽连线 / 点击+添加 -->
          <NodePort side="in" :node="n" @port-down="onPortDown" @port-add="openPicker" />
          <NodePort side="out" :node="n" @port-down="onPortDown" @port-add="openPicker" />
        </div>

        <!-- Tool 节点 -->
        <div
          v-else
          :data-node="true"
          :data-node-id="n.id"
          class="wf-node wf-node-tool"
          :class="{
            'wf-selected': workflow.selectedNodeId === n.id,
            'wf-highlight': highlightNodes.has(n.id) && workflow.selectedNodeId !== n.id,
            'wf-dragging': dragging?.id === n.id,
            'wf-executing': workflow.executingNodeId === n.id,
            'wf-completed': workflow.completedNodeIds.includes(n.id)
          }"
          :style="{ left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', minHeight: n.h + 'px' }"
          role="button"
          tabindex="0"
          :aria-label="`工具节点：${n.label}，按 Delete 删除`"
          @pointerdown="onNodePointerDown($event, n)"
          @keydown.delete.prevent="deleteNode(n, $event)"
        >
          <!-- 删除按钮（hover 时显示） -->
          <button class="wf-node-del" title="删除节点" @pointerdown.stop @click="deleteNode(n, $event)">
            <Icon name="close" :size="11" />
          </button>
          <div class="wf-node-header">
            <div class="wf-node-icon-tool"><Icon name="tool" :size="14" /></div>
            <div class="wf-node-title-wrap">
              <div class="wf-node-title">{{ n.label }}</div>
              <div class="wf-node-type">{{ n.toolId || 'tool' }}</div>
            </div>
          </div>
          <!-- 输入端口（左）+ 输出端口（右） -->
          <NodePort side="in" :node="n" @port-down="onPortDown" @port-add="openPicker" />
          <NodePort side="out" :node="n" @port-down="onPortDown" @port-add="openPicker" />
        </div>
      </template>
    </div>

    <!-- 画布缩放控件（固定在右下，不受 transform 影响） -->
    <div class="wf-zoom-bar">
      <button class="wf-zoom-btn" title="缩小" @click="workflow.zoomOut()"><Icon name="minus" :size="14" /></button>
      <button class="wf-zoom-pct" title="复位" @click="workflow.resetViewport()">{{ zoomPct }}</button>
      <button class="wf-zoom-btn" title="放大" @click="workflow.zoomIn()"><Icon name="plus" :size="14" /></button>
    </div>

    <!-- 画布提示（左下） -->
    <div class="wf-hint">
      <span class="kbd">滚轮</span>缩放 · <span class="kbd">拖拽空白</span>平移 · <span class="kbd">双击</span>复位 · <span class="kbd">Del</span>删除 · <span class="kbd">端口</span>拖拽连线/点击+
    </div>

    <!-- 添加节点弹窗 -->
    <AddNodePicker
      v-model="showPicker"
      :from-node-id="pickerNodeId"
      :side="pickerSide"
      @add="onPickerAdd"
    />

    <!-- 删除节点确认弹窗 -->
    <ConfirmDialog
      v-model="showDelNodeConfirm"
      title="删除节点"
      :desc="pendingDelNode ? `删除节点「${pendingDelNode.label}」及其相关连线？此操作不可撤销。` : ''"
      confirm-text="删除"
      danger
      @confirm="confirmDeleteNode"
    />
  </div>
</template>

<style scoped>
.wf-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-secondary);
  background-image:
    radial-gradient(rgba(115,115,115,0.14) 1px, transparent 1px),
    radial-gradient(rgba(115,115,115,0.14) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0, 12px 12px;
  cursor: default;
  user-select: none;
}
.wf-viewport {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}
.wf-edges {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  overflow: visible;
  pointer-events: none;
}
.wf-edges path.wf-edge {
  pointer-events: stroke;
  cursor: pointer;
}
.wf-edge {
  stroke: rgba(115,115,115,0.32);
  stroke-width: 1.5;
  fill: none;
  transition: stroke 0.15s, stroke-width 0.15s;
}
.wf-edge:hover {
  stroke: rgba(75,63,227,0.5);
  stroke-width: 2;
}
.wf-edge-active {
  stroke: var(--brand) !important;
  stroke-width: 2.5 !important;
}
.wf-edge-highlight {
  stroke: rgba(75,63,227,0.55);
  stroke-width: 2;
}
.wf-edge-connecting {
  stroke: var(--brand);
  stroke-width: 2;
  stroke-dasharray: 5 4;
}

/* 连线 + 按钮 */
.wf-edge-plus-group { pointer-events: all; cursor: pointer; }
.wf-edge-plus-bg {
  fill: var(--bg-default);
  stroke: rgba(75,63,227,0.3);
  stroke-width: 1;
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
  transform: scale(0.6);
  transform-origin: center;
}
.wf-edge-plus-icon {
  stroke: var(--brand);
  stroke-width: 1.8;
  stroke-linecap: round;
  fill: none;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}
.wf-edge-plus-show {
  opacity: 1 !important;
  transform: scale(1) !important;
}

/* IO 节点 */
.wf-node-io {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}
.wf-io-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 4px rgba(75,63,227,0.15);
  transition: box-shadow 0.15s;
}
.wf-node-io.wf-selected .wf-io-dot { box-shadow: 0 0 0 6px rgba(75,63,227,0.3); }
.wf-io-label {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  font-weight: 500;
  white-space: nowrap;
  position: absolute;
  top: 100%;
  margin-top: 4px;
}

/* 通用节点 */
.wf-node {
  position: absolute;
  background: var(--bg-default);
  border: 1px solid rgba(115,115,115,0.14);
  border-radius: 12px;
  padding: 12px;
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.05s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06);
}
.wf-node:active { cursor: grabbing; }
.wf-node:hover { border-color: rgba(75,63,227,0.3); box-shadow: 0 4px 12px rgba(75,63,227,0.1), 0 1px 2px rgba(0,0,0,0.06); }
.wf-selected {
  border-color: var(--brand) !important;
  box-shadow: 0 0 0 2px rgba(75,63,227,0.2), 0 8px 24px -8px rgba(75,63,227,0.3) !important;
}
.wf-highlight {
  border-color: rgba(75,63,227,0.4);
  box-shadow: 0 0 0 1px rgba(75,63,227,0.15);
}
.wf-dragging {
  box-shadow: 0 0 0 2px rgba(75,63,227,0.35), 0 12px 32px -8px rgba(75,63,227,0.35) !important;
  z-index: 10;
}
/* 执行中节点：脉冲高亮 */
.wf-executing {
  border-color: var(--brand) !important;
  box-shadow: 0 0 0 2px rgba(75,63,227,0.4), 0 0 20px rgba(75,63,227,0.25) !important;
  animation: wf-pulse 1.4s ease-in-out infinite;
}
@keyframes wf-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(75,63,227,0.3), 0 0 16px rgba(75,63,227,0.15); }
  50% { box-shadow: 0 0 0 3px rgba(75,63,227,0.5), 0 0 28px rgba(75,63,227,0.3); }
}
/* 已完成节点：绿色边框 */
.wf-completed {
  border-color: rgba(34,197,94,0.4) !important;
  box-shadow: 0 0 0 1px rgba(34,197,94,0.15) !important;
}

/* 节点删除按钮 */
.wf-node-del {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-default);
  border: 1px solid rgba(232,70,58,0.3);
  color: var(--status-error);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.7);
  transition: all 0.15s;
  z-index: 6;
  padding: 0;
}
.wf-node:hover .wf-node-del {
  opacity: 1;
  transform: scale(1);
}
.wf-node-del:hover {
  background: var(--status-error);
  color: #fff;
  border-color: var(--status-error);
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(232,70,58,0.4);
}

.wf-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.wf-node-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 0.75rem;
  flex-shrink: 0;
}
.wf-node-icon-tool {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(47,116,255,0.1);
  color: var(--status-info);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wf-node-title-wrap { flex: 1; min-width: 0; }
.wf-node-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-node-type {
  font-size: 0.625rem;
  color: var(--text-disabled);
  margin-top: 1px;
}
.wf-node-badge {
  font-size: 9.5px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(75,63,227,0.08);
  color: var(--brand);
  flex-shrink: 0;
}
.wf-node-desc {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  line-height: 1.45;
  /* 关键修复：不再截断，允许换行完整展示 */
  white-space: normal;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}
.wf-node-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.wf-skill-tag {
  font-size: 9.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--overlay-l1);
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 连接端口样式已移至 NodePort.vue 组件 */

/* 缩放控件 */
.wf-zoom-bar {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-default);
  border: 1px solid rgba(115,115,115,0.14);
  border-radius: 8px;
  padding: 3px;
  box-shadow: var(--shadow-soft);
  z-index: 20;
}
.wf-zoom-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s;
}
.wf-zoom-btn:hover { background: var(--overlay-l1); color: var(--text-default); }
.wf-zoom-pct {
  min-width: 44px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.71875rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
}
.wf-zoom-pct:hover { background: var(--overlay-l1); color: var(--text-default); }

/* 画布提示 */
.wf-hint {
  position: absolute;
  bottom: 16px;
  left: 16px;
  font-size: 0.6875rem;
  color: var(--text-disabled);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.85);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(115,115,115,0.1);
  backdrop-filter: blur(8px);
  z-index: 20;
}
</style>

