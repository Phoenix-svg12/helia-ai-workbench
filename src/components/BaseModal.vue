<script setup>
/**
 * BaseModal.vue —— 统一弹窗组件
 *
 * 解决问题：之前各 View 各写一套弹窗（TasksView/AgentsView/SettingsView/KnowledgeView），
 * 重复代码多且样式不一致。统一在此组件，复用 ConfirmDialog 的 Teleport + Esc 模式。
 *
 * 用法：
 *   <BaseModal v-model="show" title="标题" width="md">
 *     <p>内容</p>
 *     <template #footer>
 *       <button class="btn-ghost" @click="show = false">取消</button>
 *       <button class="btn-primary" @click="onConfirm">确认</button>
 *     </template>
 *   </BaseModal>
 *
 * width: sm(420px) / md(540px) / lg(680px)，默认 md
 * danger: true 时标题图标变红
 * showClose: 是否显示右上角关闭按钮，默认 true
 */
import { onMounted, onBeforeUnmount, computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  width: { type: String, default: 'md' }, // sm | md | lg
  danger: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'close'])

const maxWidth = computed(() => ({
  sm: '420px',
  md: '540px',
  lg: '680px'
}[props.width] || '540px'))

function close() {
  emit('update:modelValue', false)
  emit('close')
}
function onOverlayClick() {
  if (props.closeOnOverlay) close()
}
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
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[70] flex items-center justify-center px-4 animate-fadeIn"
      @click.self="onOverlayClick"
    >
      <div class="absolute inset-0" style="background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);"></div>
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="relative w-full rounded-2xl p-5 animate-slideUp max-h-[90vh] overflow-y-auto"
        :style="{
          maxWidth,
          background: 'var(--bg-default)',
          border: '1px solid var(--border-neutral-l1)',
          boxShadow: 'var(--shadow-dialog)'
        }"
      >
        <!-- Header -->
        <div v-if="title || showClose" class="flex items-center justify-between mb-4 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div
              v-if="danger"
              class="w-9 h-9 rounded-lg flex items-center justify-center ring-1 shrink-0"
              style="background: rgba(232,70,58,0.08); color: #E8463A; --tw-ring-color: rgba(232,70,58,0.2)"
            >
              <Icon name="info" :size="16" />
            </div>
            <div class="min-w-0">
              <h3 class="text-[15px] font-semibold text-grey-900 truncate">{{ title }}</h3>
              <p v-if="desc" class="text-[12px] text-grey-500 mt-0.5">{{ desc }}</p>
            </div>
          </div>
          <button v-if="showClose" class="icon-btn shrink-0" @click="close" aria-label="关闭">
            <Icon name="close" :size="16" />
          </button>
        </div>
        <!-- Body -->
        <div class="modal-body">
          <slot />
        </div>
        <!-- Footer -->
        <div v-if="$slots.footer" class="mt-5 flex items-center justify-end gap-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
