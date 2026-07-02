import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { persistPlugin } from './stores/persist'
import clickOutside from './directives/clickOutside'
import { initScheduler } from './services/scheduler'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(persistPlugin)
app.use(pinia)
app.use(router)
app.directive('click-outside', clickOutside)

// 全局错误处理（P2-2）：捕获未处理异常，避免白屏
app.config.errorHandler = (err, instance, info) => {
  console.error('[Helia 全局错误]', info, err)
}

app.mount('#app')

// 启动定时调度器（在 pinia + persist 初始化之后）
initScheduler()
