/**
 * v-click-outside 指令
 * 用法：<div v-click-outside="handler">...</div>
 * 点击指令元素以外的任意区域时触发 handler(event)。
 * 基于捕获阶段 document 监听，正确处理嵌套与冒泡，避免 @blur 时序竞态。
 */
export default {
  mounted(el, binding) {
    el._clickOutside = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        if (typeof binding.value === 'function') binding.value(event)
      }
    }
    // 捕获阶段，确保在内部 click 冒泡前就能判断"是否在外部"
    document.addEventListener('click', el._clickOutside, true)
    // 触摸支持
    document.addEventListener('touchstart', el._clickOutside, true)
  },
  unmounted(el) {
    if (el._clickOutside) {
      document.removeEventListener('click', el._clickOutside, true)
      document.removeEventListener('touchstart', el._clickOutside, true)
      delete el._clickOutside
    }
  }
}
