import { createRouter, createWebHashHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import AgentsView from '@/views/AgentsView.vue'
import TasksView from '@/views/TasksView.vue'
import KnowledgeView from '@/views/KnowledgeView.vue'
import SettingsView from '@/views/SettingsView.vue'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', name: 'chat', component: ChatView, meta: { title: '对话' } },
  { path: '/chat/:id', name: 'chat-thread', component: ChatView, meta: { title: '对话' } },
  { path: '/agents', name: 'agents', component: AgentsView, meta: { title: '智能体画布' } },
  { path: '/tasks', name: 'tasks', component: TasksView, meta: { title: '任务' } },
  { path: '/knowledge', name: 'knowledge', component: KnowledgeView, meta: { title: '知识库' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } },
  // M16 修复：未匹配路径重定向到对话页，避免空白 RouterView
  { path: '/:pathMatch(.*)*', redirect: '/chat' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
