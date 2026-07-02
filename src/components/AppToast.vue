<script setup>
import { useToastStore } from '@/stores/toast'
import Icon from '@/components/Icon.vue'

const toast = useToastStore()
</script>

<template>
  <div class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
    <transition-group name="toast">
      <div
        v-for="t in toast.items" :key="t.id"
        @click="toast.dismiss(t.id)"
        :class="['pointer-events-auto cursor-pointer flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[12.5px] font-medium animate-slideUp backdrop-blur',
                 t.type === 'success' ? 'bg-[rgba(21,168,119,0.1)] text-[#15A877] ring-1 ring-[rgba(21,168,119,0.2)]'
                 : t.type === 'warn' ? 'bg-[rgba(226,121,0,0.1)] text-[#E27900] ring-1 ring-[rgba(226,121,0,0.2)]'
                 : t.type === 'error' ? 'bg-[rgba(232,70,58,0.1)] text-[#E8463A] ring-1 ring-[rgba(232,70,58,0.2)]'
                 : 'bg-[#171717] text-[#FFFFFF] ring-1 ring-[rgba(115,115,115,0.12)]']"
        style="box-shadow:0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);"
      >
        <span
          :class="['w-1.5 h-1.5 rounded-full',
                   t.type === 'success' ? 'bg-[#15A877]'
                   : t.type === 'warn' ? 'bg-[#E27900]'
                   : t.type === 'error' ? 'bg-[#E8463A]'
                   : 'bg-[#737373]']"
        ></span>
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-from { opacity: 0; transform: translateY(12px); }
.toast-leave-to   { opacity: 0; transform: translateY(-8px); }
.toast-enter-active, .toast-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}
</style>
