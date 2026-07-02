<script setup>
/**
 * SkeletonLoader.vue —— 骨架屏加载占位组件
 *
 * 用法：
 *   <SkeletonLoader type="card" :count="3" />
 *   <SkeletonLoader type="list" :count="5" />
 *   <SkeletonLoader type="message" />
 *   <SkeletonLoader type="table" :rows="4" :cols="4" />
 */
defineProps({
  type: {
    type: String,
    default: 'card',
    validator: v => ['card', 'list', 'message', 'table', 'chat'].includes(v)
  },
  count: { type: Number, default: 3 },
  rows: { type: Number, default: 4 },
  cols: { type: Number, default: 4 }
})
</script>

<template>
  <!-- 卡片骨架 -->
  <template v-if="type === 'card'">
    <div
      v-for="i in count"
      :key="i"
      class="card p-4 animate-pulse"
    >
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg bg-grey-200 shrink-0"></div>
        <div class="flex-1 space-y-2">
          <div class="h-3.5 rounded bg-grey-200 w-2/3"></div>
          <div class="h-2.5 rounded bg-grey-100 w-full"></div>
          <div class="h-2.5 rounded bg-grey-100 w-4/5"></div>
          <div class="flex gap-2 mt-2">
            <div class="h-5 rounded bg-grey-100 w-14"></div>
            <div class="h-5 rounded bg-grey-100 w-10"></div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- 列表骨架 -->
  <template v-else-if="type === 'list'">
    <div
      v-for="i in count"
      :key="i"
      class="px-4 py-3 hairline-b animate-pulse"
    >
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-md bg-grey-200 shrink-0"></div>
        <div class="flex-1 space-y-1.5">
          <div class="h-3 rounded bg-grey-200 w-1/2"></div>
          <div class="h-2 rounded bg-grey-100 w-3/4"></div>
        </div>
      </div>
    </div>
  </template>

  <!-- 消息骨架（单条聊天消息） -->
  <template v-else-if="type === 'message'">
    <div class="flex items-start gap-3 animate-pulse">
      <div class="w-7 h-7 rounded-lg bg-grey-200 shrink-0"></div>
      <div class="flex-1 space-y-2">
        <div class="flex items-center gap-2">
          <div class="h-3 rounded bg-grey-200 w-20"></div>
          <div class="h-2 rounded bg-grey-100 w-10"></div>
        </div>
        <div class="h-3 rounded bg-grey-100 w-full"></div>
        <div class="h-3 rounded bg-grey-100 w-5/6"></div>
        <div class="h-3 rounded bg-grey-100 w-4/5"></div>
      </div>
    </div>
  </template>

  <!-- 聊天列表骨架 -->
  <template v-else-if="type === 'chat'">
    <div class="space-y-5 max-w-3xl mx-auto">
      <div v-for="i in count" :key="i" class="flex items-start gap-3 animate-pulse">
        <div
          class="w-7 h-7 rounded-lg shrink-0"
          :class="i % 2 === 1 ? 'bg-grey-200' : ''"
          :style="i % 2 === 0 ? 'background:#4B3FE3' : ''"
        ></div>
        <div class="flex-1 space-y-2">
          <div class="flex items-center gap-2">
            <div class="h-3 rounded bg-grey-200 w-16"></div>
            <div class="h-2 rounded bg-grey-100 w-8"></div>
          </div>
          <div class="h-3 rounded bg-grey-100" :style="`width:${60 + (i * 7) % 35}%`"></div>
          <div class="h-3 rounded bg-grey-100" :style="`width:${50 + (i * 11) % 40}%`"></div>
        </div>
      </div>
    </div>
  </template>

  <!-- 表格骨架 -->
  <template v-else-if="type === 'table'">
    <div class="animate-pulse">
      <!-- 表头 -->
      <div class="flex gap-3 pb-2 hairline-b">
        <div
          v-for="c in cols"
          :key="c"
          class="h-3 rounded bg-grey-200 flex-1"
          :style="`width:${100/cols}%`"
        ></div>
      </div>
      <!-- 行 -->
      <div v-for="r in rows" :key="r" class="flex gap-3 py-2.5 hairline-b">
        <div
          v-for="c in cols"
          :key="c"
          class="h-3 rounded bg-grey-100 flex-1"
          :style="`width:${100/cols}%`"
        ></div>
      </div>
    </div>
  </template>
</template>
