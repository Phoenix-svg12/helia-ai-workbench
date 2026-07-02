<script setup>
defineProps({
  modelValue: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>

<template>
  <label class="flex items-center justify-between gap-3 py-2.5 px-1 cursor-pointer">
    <div class="min-w-0">
      <div class="text-[12.5px] text-grey-800 font-medium">
        <slot name="label" />
      </div>
      <div class="text-[11px] text-grey-500 mt-0.5">
        <slot name="desc" />
      </div>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      @click.prevent="$emit('update:modelValue', !modelValue)"
      :class="['relative w-9 h-5 rounded-full transition-colors shrink-0',
               modelValue ? 'bg-[#4B3FE3]' : 'bg-[rgba(115,115,115,0.16)]']"
    >
      <span
        :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                 modelValue ? 'translate-x-4' : 'translate-x-0']"
        :style="modelValue ? '' : 'border:1px solid rgba(115,115,115,0.12)'"
      ></span>
    </button>
  </label>
</template>
