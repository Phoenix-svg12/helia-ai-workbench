<script setup>
/**
 * Icon.vue —— 统一图标组件
 *
 * 解决问题：之前每个 View 都用 v-if 链判断图标名，重复且难维护。
 * 统一在此注册所有图标 path，View 层只需 <Icon name="chat" />。
 *
 * 用法：
 *   <Icon name="chat" class="w-4 h-4" />
 *   <Icon name="spark" :size="16" />
 *
 * 所有图标使用 24x24 viewBox，stroke 风格统一（fill="none" stroke="currentColor"）。
 * 少数填充图标（pin / dot）用 fill="currentColor"。
 */
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: null }, // 数字像素或字符串，传了就用
  fill: { type: Boolean, default: false } // 是否填充（默认 stroke）
})

// 图标 path 库 —— 按字母序
const PATHS = {
  // 导航
  chat:    'M21 12a8 8 0 0 1-12.4 6.7L3 20l1.3-5.6A8 8 0 1 1 21 12Z',
  spark:   'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  list:    'M4 6h16M4 12h16M4 18h10',
  book:    'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4ZM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7V4Z',
  gear:    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',

  // 操作
  plus:    'M12 5v14M5 12h14',
  minus:   'M5 12h14',
  arrowR:  'M5 12h14M13 5l7 7-7 7',
  arrowL:  'M19 12H5M11 19l-7-7 7-7',
  arrowDown: 'M6 9l6 6 6-6',
  check:   'M20 6L9 17l-5-5',
  close:   'M6 6l12 12M18 6L6 18',
  sun:     'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:    'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  chevR:   'M9 6l6 6-6 6',
  chevL:   'M15 6l-6 6 6 6',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  search:  'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-4.3-4.3',
  share:   'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14',
  download:'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload:  'M12 21V9M7 14l5-5 5 5M5 3h14',
  copy:    'M9 9m0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2zM5 15V5a2 2 0 0 1 2-2h10',
  edit:    'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  trash:   'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  pin:     'M14 4l6 6-3 1-1 4-3-3-5 5H6v-2l5-5-3-3 4-1 1-3 1 1Z',
  more:    'M5 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M19 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
  bell:    'M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9ZM10 21a2 2 0 0 0 4 0',
  attachment:'M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5L11 18.5a2 2 0 0 1-3-3l7-7',
  globe:   'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  cpu:     'M5 5h14v14H5zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3',
  shield:  'M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3ZM9 12l2 2 4-4',
  key:     'M8 15m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M11 12l9-9M16 7l3 3',
  info:    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 8v4M12 16h.01',
  doc:     'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  mail:    'M4 4h16v16H4zM4 4l8 7 8-7',
  bulb:    'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z',
  cal:     'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4',
  code:    'M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16',
  tool:    'M14 4l6 6-4 1-1 4-4-4-7 7H2v-2l7-7-4-4 4-1 1-4 4 4Z',
  sync:    'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  lock:    'M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4',
  eye:     'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  file:    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  quote:   'M7 8a3 3 0 0 0-3 3v5h5v-5H6a3 3 0 0 1 3-3M16 8a3 3 0 0 0-3 3v5h5v-5h-3a3 3 0 0 1 3-3',
  grid:    'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  menu:    'M4 6h16M4 12h16M4 18h16',
  play:    'M5 12h14M13 5l7 7-7 7',
  stop:    'M6 6h12v12H6z',
  heart:   'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 16.6 20H7',
  flag:    'M14 4l6 6-3 1-1 4-3-3-5 5H6v-2l5-5-3-3 4-1 1-3 1 1Z',
  cube:    'M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  loading: 'M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12',
  table:   'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  warn:    'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  layers:  'M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  pause:   'M6 4h4v16H6zM14 4h4v16h-4z'
}

const path = computed(() => PATHS[props.name] || '')
const isFill = computed(() => ['pin', 'more'].includes(props.name))
const sizeStyle = computed(() => {
  if (props.size == null) return null
  const s = typeof props.size === 'number' ? props.size + 'px' : props.size
  return { width: s, height: s }
})
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :style="sizeStyle"
    :fill="isFill || fill ? 'currentColor' : 'none'"
    :stroke="isFill || fill ? 'none' : 'currentColor'"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="path" />
  </svg>
</template>
