<script setup>
/**
 * NodePort.vue —— 可复用的节点连接端口
 *
 * 设计参考 n8n / Dify / Coze：
 *   - 输入(in)/输出(out)端口外观统一（圆形 + 加号图标）
 *   - 拖拽创建连线：pointerdown 起，拖到目标节点 pointerup 连接
 *   - 点击 + 快速添加相邻节点（触发 @add 事件，由父组件弹选择器）
 *   - 方向感知：
 *       side='out' → 操作下游（添加/连接右侧节点）
 *       side='in'  → 操作上游（添加/连接左侧节点）
 *
 * 用法：
 *   <NodePort side="out" :node="n" @port-down="onPortDown" @port-add="onPortAdd" />
 */
const props = defineProps({
  side: { type: String, required: true, validator: v => ['in', 'out'].includes(v) },
  node: { type: Object, required: true }
})
const emit = defineEmits(['port-down', 'port-add'])

// 区分拖拽与点击：记录 pointerdown 起始位置，click 时判断移动距离
const DRAG_THRESHOLD = 5
let _downX = 0
let _downY = 0
let _isDrag = false

function onPointerDown(e) {
  e.stopPropagation()
  _downX = e.clientX
  _downY = e.clientY
  _isDrag = false
  emit('port-down', { event: e, node: props.node, side: props.side })
}

function onPointerMove(e) {
  if (_isDrag) return
  if (Math.abs(e.clientX - _downX) > DRAG_THRESHOLD || Math.abs(e.clientY - _downY) > DRAG_THRESHOLD) {
    _isDrag = true
  }
}

function onAdd(e) {
  // 拖拽连线后不触发"添加节点"
  if (_isDrag) return
  e.stopPropagation()
  emit('port-add', { node: props.node, side: props.side })
}
</script>

<template>
  <div
    :class="['wf-port', `wf-port-${side}`]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @click.stop="onAdd"
    :title="side === 'out'
      ? '拖拽连线到其他节点 · 点击添加下游节点'
      : '拖拽连线到其他节点 · 点击添加上游节点'"
  >
    <div class="wf-port-plus">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.wf-port {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-default);
  border: 1.5px solid rgba(75,63,227,0.25);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
}
.wf-port-in { left: -11px; }
.wf-port-out { right: -11px; }

.wf-port:hover {
  background: #4B3FE3;
  border-color: #4B3FE3;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 2px 8px rgba(75,63,227,0.35);
}

.wf-port-plus {
  color: #4B3FE3;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
  pointer-events: none;
}
.wf-port:hover .wf-port-plus { color: #fff; }
</style>
