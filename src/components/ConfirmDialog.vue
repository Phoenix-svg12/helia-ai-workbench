<script setup>
/**
 * 通用确认弹窗 —— v-model 控制显隐，确认/取消回调。
 * 用法：
 *   <ConfirmDialog v-model="show" title="..." desc="..."
 *      confirm-text="删除" danger @confirm="onConfirm" />
 */
import { onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '确认操作？' },
  desc: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

function close() { emit('update:modelValue', false) }
function onCancel() { emit('cancel'); close() }
function onConfirm() { emit('confirm'); close() }

// M17 修复：统一 Esc 关闭，所有调用方（含 AppSidebar）均受益
function onKey(e) {
  if (e.key === 'Escape' && props.modelValue) {
    e.preventDefault()
    onCancel()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- H12 修复：Teleport 到 body，避免父级（如 AppSidebar 的 translate-x）创建新 containing block 导致遮罩与弹窗定位错乱 -->
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[70] flex items-center justify-center px-4 animate-fadeIn" @click.self="onCancel">
      <div class="absolute inset-0" style="background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);"></div>
      <div
        role="dialog"
        aria-modal="true"
        class="relative w-full max-w-sm rounded-2xl p-5 animate-slideUp"
        style="background: var(--bg-default); border: 1px solid var(--border-neutral-l1); box-shadow: var(--shadow-dialog);"
      >
        <div class="flex items-center gap-3 mb-3">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center ring-1 shrink-0"
            :style="danger ? 'background: rgba(232,70,58,0.08); color: #E8463A; --tw-ring-color: rgba(232,70,58,0.2)' : 'background: rgba(75,63,227,0.08); color: #4B3FE3; --tw-ring-color: rgba(75,63,227,0.2)'"
          >
            <Icon name="warn" :size="16" />
          </div>
          <h3 class="text-[15px] font-semibold text-grey-900">{{ title }}</h3>
        </div>
        <p v-if="desc" class="text-[12.5px] text-grey-500 mb-5 leading-relaxed">{{ desc }}</p>
        <div v-else class="mb-5"></div>
        <div class="flex items-center justify-end gap-2">
          <button class="btn-ghost" @click="onCancel">{{ cancelText }}</button>
          <button
            class="btn-primary"
            :style="danger ? 'background: #E8463A;' : ''"
            @click="onConfirm"
          >{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
