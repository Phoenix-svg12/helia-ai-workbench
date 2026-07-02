<script setup>
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useToastStore } from '@/stores/toast'
import { useAgentStore } from '@/stores/agents'
import { useUIStore } from '@/stores/ui'
import { useRoute } from 'vue-router'
import { renderMarkdown } from '@/utils/markdown'
import Icon from '@/components/Icon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BaseModal from '@/components/BaseModal.vue'

const chat = useChatStore()
const toast = useToastStore()
const agents = useAgentStore()
const ui = useUIStore()
const route = useRoute()
const scroll = ref(null)
const composerEl = ref(null)
const dragging = ref(false)
const fileInput = ref(null)
const attachments = ref([])
const moreMenuOpen = ref(false)

function toggleMoreMenu() { moreMenuOpen.value = !moreMenuOpen.value }
function closeMoreMenu() { moreMenuOpen.value = false }

function pinThread() {
  if (!chat.activeThread) return
  const pinned = chat.togglePin(chat.activeId)
  toast.push(pinned ? '已置顶对话' : '已取消置顶', 'info')
  closeMoreMenu()
}

// 重命名对话（用 BaseModal 替代 window.prompt）
const showRenameModal = ref(false)
const renameValue = ref('')
const renameInput = ref(null)
function renameThread() {
  if (!chat.activeThread) return
  renameValue.value = chat.activeThread.title
  showRenameModal.value = true
  closeMoreMenu()
}
function confirmRename() {
  const name = renameValue.value.trim()
  if (name) {
    chat.renameThread(chat.activeId, name)
    toast.push('对话已重命名', 'success')
  }
  showRenameModal.value = false
}

const showClearMsgConfirm = ref(false)

function clearThreadMessages() {
  if (!chat.activeId) return
  showClearMsgConfirm.value = true
  closeMoreMenu()
}
function confirmClearMessages() {
  if (!chat.activeId) return
  chat.clearThreadMessages(chat.activeId)
  toast.push('当前对话消息已清空', 'success')
}

// 点击外部关闭菜单（用 ref 替代 getElementById，更稳健）
function onDocClick(e) {
  if (moreMenuOpen.value) {
    const menu = document.getElementById('chat-more-menu')
    const btn = document.getElementById('chat-more-btn')
    if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
      moreMenuOpen.value = false
    }
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const suggestions = [
  { icon: '✦',  title: '总结这周 3 份客户访谈',     sub: '用要点上墙风格' },
  { icon: '⌘',  title: '把这段 diff 重写为更可读的 Python', sub: '保留行为' },
  { icon: '✉',  title: '把中文草稿改为商务日语',    sub: '附敬语注解' },
  { icon: '✺',  title: '从这份 PDF 抽取所有数字与日期', sub: 'Markdown 表格' }
]

// send / regenerate 已下沉到 chat store，View 层只调用
function send() {
  const v = chat.composer.trim()
  if (!v) return
  if (chat.isStreaming) {
    toast.push('请等待当前生成完成', 'warn')
    return
  }
  // 如果正在编辑某条消息，先截断
  if (editingId.value) {
    chat.truncateAfter(editingId.value)
    editingId.value = null
  }
  // systemPrompt 由 store.activeSystemPrompt 内部计算（含 RAG 注入）
  chat.send(v)
  attachments.value = []
  // 重置输入框高度（程序化清空不触发 @input）
  nextTick(() => {
    if (composerEl.value) composerEl.value.style.height = 'auto'
    scrollToBottom()
  })
}

// 停止流式生成
function stopGeneration() {
  chat.cancelStream()
  toast.push('已停止生成', 'info')
}

// 编辑用户消息：填充到输入框，标记编辑状态
const editingId = ref(null)
function editMessage(m) {
  chat.composer = m.content
  editingId.value = m.id
  toast.push('编辑消息后发送将替换后续对话', 'info')
  nextTick(() => {
    if (composerEl.value) {
      composerEl.value.focus()
      composerEl.value.setSelectionRange(m.content.length, m.content.length)
      composerEl.value.style.height = 'auto'
      composerEl.value.style.height = Math.min(composerEl.value.scrollHeight, 180) + 'px'
    }
  })
}
// 取消编辑
function cancelEdit() {
  editingId.value = null
  chat.composer = ''
}

function askSuggestion(q) {
  chat.composer = q
  send()
}

function onComposerEnter(e) {
  if (chat.sendOnEnter) {
    e.preventDefault()
    send()
  }
}

function scrollToBottom(smooth = true) {
  if (!scroll.value) return
  scroll.value.scrollTo({ top: scroll.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

// 检查用户是否接近底部（用于流式生成时判断是否自动滚动）
function isNearBottom() {
  if (!scroll.value) return true
  const el = scroll.value
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

watch(() => chat.activeMessages.length, () => nextTick(() => scrollToBottom()))
// 流式生成时仅在用户接近底部时才自动滚动，避免打断用户回看历史
watch(() => chat.activeMessages.at(-1)?.content, () => {
  if (isNearBottom()) nextTick(() => scrollToBottom(false))
})
// 切换会话时重置编辑状态
watch(() => chat.activeId, () => {
  editingId.value = null
  nextTick(() => scrollToBottom(false))
})
watch(() => route.params.id, (id) => { if (id) chat.setActive(id) })
onMounted(() => {
  if (route.params.id) chat.setActive(route.params.id)
  nextTick(() => scrollToBottom(false))
})

function autoGrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 180) + 'px'
}

function onDrop(e) {
  e.preventDefault()
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length) {
    files.forEach(f => {
      attachments.value.push({ name: f.name, size: f.size, type: f.type })
    })
    toast.push(`已添加 ${files.length} 个附件`, 'success')
    return
  }
  const text = (e.dataTransfer?.getData('text') || '').trim()
  if (text) {
    chat.composer = (chat.composer + ' ' + text).trim()
    composerEl.value?.focus()
  }
}

function copyMessage(m) {
  if (!navigator.clipboard) {
    toast.push('当前环境不支持复制，请手动选择文本复制', 'warn')
    return
  }
  navigator.clipboard.writeText(m.content).then(() => {
    toast.push('已复制到剪贴板', 'success')
  }).catch(() => {
    toast.push('复制失败', 'error')
  })
}

// 调用 store 的 regenerate action（业务逻辑已下沉）
function regenerate(m) {
  if (chat.isStreaming) {
    toast.push('请等待当前生成完成', 'warn')
    return
  }
  const ok = chat.regenerate(m.id)
  if (!ok) {
    toast.push('无法重新生成，请重试', 'warn')
    return
  }
  toast.push('正在重新生成…', 'info')
}

function likeMessage(m, type) {
  const prev = m.feedback
  chat.setMessageFeedback(m.id, type)
  toast.push(prev === type ? '已取消反馈' : (type === 'up' ? '已点赞' : '已标记不喜欢'), 'info')
}

function shareThread() {
  if (navigator.clipboard) {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      toast.push('分享链接已复制到剪贴板', 'success')
    }).catch(() => {
      toast.push('复制失败，请手动复制地址栏链接', 'warn')
    })
  } else {
    toast.push('当前环境不支持自动复制，请手动复制地址栏链接', 'warn')
  }
}

function exportThread() {
  const msgs = chat.activeMessages
  const text = `# ${chat.activeThread?.title || '对话'}\n\n` +
    msgs.map(m => `**${m.role === 'user' ? ui.user.name : m.model || 'Helia'}** (${m.ts})\n${m.content}`).join('\n\n---\n\n')
  const blob = new Blob([text], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${chat.activeThread?.title || '对话'}.md`
  a.click()
  URL.revokeObjectURL(url)
  toast.push('已导出为 Markdown', 'success')
}

function attachFile() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  files.forEach(f => {
    attachments.value.push({ name: f.name, size: f.size, type: f.type })
  })
  toast.push(`已添加 ${files.length} 个附件`, 'success')
  e.target.value = ''
}

function removeAttachment(idx) {
  attachments.value.splice(idx, 1)
}

function toggleWebSearch() {
  chat.webSearch = !chat.webSearch
  toast.push(chat.webSearch ? '已开启网络搜索' : '已关闭网络搜索', chat.webSearch ? 'success' : 'info')
}

function toggleArtifacts() {
  chat.artifacts = !chat.artifacts
  toast.push(chat.artifacts ? '已开启 Artifacts 生成' : '已关闭 Artifacts 生成', chat.artifacts ? 'success' : 'info')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Thread header -->
    <div v-if="chat.activeThread" class="px-4 md:px-6 pt-4 md:pt-5 pb-3 shrink-0">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1.5">
            <span v-if="chat.activeThread.pinned" class="chip-accent">
              <Icon name="pin" :size="12" />
              已置顶
            </span>
            <span class="chip">{{ chat.activeThread.group }}</span>
            <span class="text-[11px] text-grey-500 font-mono">{{ chat.activeThread.updated }}</span>
          </div>
          <h1 class="text-[22px] md:text-[24px] font-semibold tracking-tight text-grey-900 leading-tight text-balance flex items-center gap-2 group/title">
            {{ chat.activeThread.title }}
            <button
              class="icon-btn !p-1 opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 transition-opacity"
              title="重命名对话"
              aria-label="重命名对话"
              @click="renameThread"
            >
              <Icon name="edit" :size="14" />
            </button>
          </h1>
          <p class="mt-1 text-[12.5px] text-grey-500 text-pretty">{{ chat.activeThread.preview }}</p>
        </div>
        <div class="flex items-center gap-1.5">
          <button class="btn-ghost" title="分享" @click="shareThread">
            <Icon name="share" :size="14" />
            <span class="hidden md:inline">分享</span>
          </button>
          <button class="btn-ghost" title="导出" @click="exportThread">
            <Icon name="download" :size="14" />
            <span class="hidden md:inline">导出</span>
          </button>
          <div class="relative">
            <button id="chat-more-btn" class="icon-btn" title="更多" @click="toggleMoreMenu">
              <Icon name="more" :size="16" />
            </button>
            <div
              v-if="moreMenuOpen"
              id="chat-more-menu"
              class="absolute right-0 top-full mt-1 w-44 rounded-lg border border-black/10 bg-white shadow-lg py-1 z-20"
            >
              <button class="w-full text-left px-3 py-1.5 text-[13px] hover:bg-grey-100 flex items-center gap-2" @click="pinThread">
                <Icon name="pin" :size="14" />
                {{ chat.activeThread?.pinned ? '取消置顶' : '置顶对话' }}
              </button>
              <button class="w-full text-left px-3 py-1.5 text-[13px] hover:bg-grey-100 flex items-center gap-2" @click="renameThread">
                <Icon name="code" :size="14" />
                重命名对话
              </button>
              <button class="w-full text-left px-3 py-1.5 text-[13px] hover:bg-grey-100 flex items-center gap-2" @click="exportThread">
                <Icon name="download" :size="14" />
                导出为 Markdown
              </button>
              <div class="my-1 border-t border-black/10"></div>
              <button class="w-full text-left px-3 py-1.5 text-[13px] hover:bg-red-50 text-red-600 flex items-center gap-2" @click="clearThreadMessages">
                <Icon name="trash" :size="14" />
                清空消息
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div
      ref="scroll"
      class="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-4"
    >
      <div v-if="!chat.activeMessages.length" class="h-full flex flex-col items-center justify-center -mt-6 text-center">
        <!-- 智能体开场白（参考 Coze 的 Bot 开场白） -->
        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-white font-semibold text-[20px] shrink-0"
          :style="{ background: agents.selected?.color || '#4B3FE3' }"
        >
          {{ (agents.selected?.name || 'H')[0] }}
        </div>
        <h2 class="text-[18px] font-semibold tracking-tight text-grey-800 text-balance">
          {{ agents.selected?.name || 'Helia' }}
        </h2>
        <p class="text-[11.5px] text-grey-400 mt-0.5">{{ agents.selected?.desc || '智能工作台助手' }}</p>
        <p v-if="agents.selected?.greeting" class="mt-3 text-[13px] text-grey-600 max-w-lg text-pretty leading-relaxed bg-grey-100 rounded-xl p-3">
          {{ agents.selected.greeting }}
        </p>
        <p v-else class="mt-1.5 text-[12.5px] text-grey-500 max-w-md text-pretty">可以拖入文件、引用代码片段，或直接描述你的目标。Helia 会保持上下文，支持多轮回溯。</p>

        <!-- 智能体推荐问题（参考 Coze 的推荐问题） -->
        <div v-if="agents.selected?.suggestedQuestions?.length" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
          <button
            v-for="(q, i) in agents.selected.suggestedQuestions" :key="i"
            @click="askSuggestion(q)"
            class="card-hover text-left flex items-start gap-2.5 p-3 group"
          >
            <span class="w-7 h-7 rounded-lg bg-brand-600/8 ring-1 ring-brand-600/15 flex items-center justify-center shrink-0 group-hover:ring-brand-600/30 transition">
              <Icon name="chevR" :size="14" class="text-brand-500" />
            </span>
            <div class="min-w-0">
              <div class="text-[13px] text-grey-800 font-medium">{{ q }}</div>
            </div>
          </button>
        </div>
        <!-- 没有推荐问题时显示默认建议 -->
        <div v-else class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
          <button
            v-for="(s, i) in suggestions" :key="i"
            @click="chat.composer = s.title; send()"
            class="card-hover text-left flex items-start gap-2.5 p-3 group"
          >
            <span class="w-7 h-7 rounded-lg bg-brand-600/8 ring-1 ring-brand-600/15 flex items-center justify-center shrink-0 group-hover:ring-brand-600/30 transition">
              <span class="text-brand-500 text-[14px]">{{ s.icon }}</span>
            </span>
            <div class="min-w-0">
              <div class="text-[13px] text-grey-800 font-medium truncate">{{ s.title }}</div>
              <div class="text-[11px] text-grey-500 mt-0.5">{{ s.sub }}</div>
            </div>
          </button>
        </div>
      </div>

      <ol v-else class="space-y-5 max-w-3xl mx-auto">
        <li
          v-for="m in chat.activeMessages" :key="m.id"
          class="group animate-slideUp"
          :role="m.role === 'user' ? 'listitem' : 'listitem'"
          :aria-label="`${m.role === 'user' ? '你的消息' : '助手回复'}`"
        >
          <div class="flex items-start gap-3">
            <div
              :class="['w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-semibold shrink-0',
                       m.role === 'user' ? 'bg-grey-200 text-grey-700 ring-1 ring-grey-300' : 'text-white' ]"
              :style="m.role === 'assistant' ? 'background: #4B3FE3' : ''"
            >
              {{ m.role === 'user' ? '你' : 'H' }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[12px] font-medium text-grey-800">{{ m.role === 'user' ? ui.user.name : chat.model }}</span>
                <span class="text-[10.5px] text-grey-400 font-mono">{{ m.ts }}</span>
                <span v-if="m.model" class="chip-accent text-[10px]">{{ m.model }}</span>
                <span v-if="m.tokens" class="text-[10.5px] text-grey-400 font-mono">· {{ m.tokens }} tokens · {{ m.duration }}</span>
              </div>
              <div
                v-if="m.role === 'user'"
                class="text-[14px] leading-[1.75] text-grey-800 whitespace-pre-wrap text-pretty"
              >{{ m.content }}</div>
              <div
                v-else
                class="text-[14px] leading-[1.75] text-grey-800 prose-msg"
                v-html="renderMarkdown(m.content)"
              ></div><span v-if="m.typing" class="inline-flex gap-1 align-middle ml-1">
                  <span class="w-1 h-1 rounded-full bg-brand-600 animate-typing" style="animation-delay:0s"></span>
                  <span class="w-1 h-1 rounded-full bg-brand-600 animate-typing" style="animation-delay:0.15s"></span>
                  <span class="w-1 h-1 rounded-full bg-brand-600 animate-typing" style="animation-delay:0.3s"></span>
                </span>

              <!-- Action bar -->
              <div v-if="!m.typing" class="mt-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="icon-btn" title="复制" @click="copyMessage(m)">
                  <Icon name="copy" :size="14" />
                </button>
                <button v-if="m.role === 'user'" class="icon-btn" title="编辑并重新发送" @click="editMessage(m)">
                  <Icon name="edit" :size="14" />
                </button>
                <button v-if="m.role === 'assistant'" class="icon-btn" title="重新生成" @click="regenerate(m)">
                  <Icon name="refresh" :size="14" />
                </button>
                <button v-if="m.role === 'assistant'" class="icon-btn" title="点赞" :class="m.feedback === 'up' ? 'text-brand-600 bg-brand-600/8' : ''" @click="likeMessage(m, 'up')">
                  <Icon name="heart" :size="14" />
                </button>
                <button v-if="m.role === 'assistant'" class="icon-btn" title="不喜欢" :class="m.feedback === 'down' ? 'text-error bg-error/8' : ''" @click="likeMessage(m, 'down')">
                  <Icon name="flag" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>

    <!-- Composer -->
    <div
      class="px-4 md:px-6 pb-4 md:pb-5 pt-2 shrink-0"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop="onDrop"
    >
      <!-- 编辑模式提示 -->
      <div v-if="editingId" class="mx-auto max-w-3xl mb-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-brand-600/8 text-[12px] text-brand-600">
        <span class="flex items-center gap-1.5">
          <Icon name="edit" :size="12" />
          正在编辑消息，发送后将替换原消息及后续对话
        </span>
        <button class="icon-btn !p-0.5" title="取消编辑" @click="cancelEdit">
          <Icon name="close" :size="12" />
        </button>
      </div>
      <div
        :class="['mx-auto max-w-3xl surface rounded-xl md:rounded-2xl p-2 transition-all',
                 dragging ? 'ring-2 ring-brand-600/30 shadow-menu' : '']"
      >
        <textarea
          ref="composerEl"
          v-model="chat.composer"
          @keydown.enter.exact="onComposerEnter"
          @input="autoGrow"
          rows="1"
          placeholder="给 Helia 提一个目标，或拖入文件、图片、链接…"
          class="w-full bg-transparent outline-none resize-none text-[14px] leading-[1.6] text-grey-800 placeholder:text-grey-400 px-3 pt-2 pb-1 max-h-[180px]"
        />
        <div v-if="attachments.length" class="flex flex-wrap gap-1.5 px-2.5 pb-1">
          <div
            v-for="(att, i) in attachments" :key="att.id || att.name + i"
            class="flex items-center gap-1.5 rounded-md bg-grey-100 ring-1 ring-grey-200 px-2 py-1 text-[11px] text-grey-700"
          >
            <Icon name="file" :size="12" class="text-grey-500 shrink-0" />
            <span class="truncate max-w-[140px]">{{ att.name }}</span>
            <button @click="removeAttachment(i)" title="删除附件" aria-label="删除附件" class="text-grey-400 hover:text-error shrink-0">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
        <div class="flex items-center gap-1 px-1.5 pt-1">
          <button class="icon-btn" title="附件" @click="attachFile">
            <Icon name="attachment" :size="16" />
          </button>
          <input ref="fileInput" type="file" multiple class="hidden" @change="onFileChange" />
          <button class="icon-btn" title="网络搜索" :class="chat.webSearch ? 'text-brand-600 bg-brand-600/8' : ''" @click="toggleWebSearch">
            <Icon name="globe" :size="16" />
          </button>
          <button class="icon-btn" title="Artifacts" :class="chat.artifacts ? 'text-brand-600 bg-brand-600/8' : ''" @click="toggleArtifacts">
            <Icon name="grid" :size="16" />
          </button>
          <div class="ml-auto flex items-center gap-2">
            <span class="hidden md:flex items-center gap-1.5 text-[10.5px] text-grey-400">
              <span class="kbd">↵</span>发送 · <span class="kbd">⇧↵</span>换行
            </span>
            <button
              v-if="!chat.isStreaming"
              @click="send"
              :disabled="!chat.composer.trim()"
              class="btn-primary"
            >
              <Icon name="arrowR" :size="14" />
              发送
            </button>
            <button
              v-else
              @click="stopGeneration"
              class="btn-primary !bg-grey-700 hover:!bg-grey-800"
              title="停止生成"
            >
              <Icon name="close" :size="14" />
              停止
            </button>
          </div>
        </div>
      </div>
      <p class="mt-2 text-center text-[10.5px] text-grey-400">Helia 可能会犯错，请核查关键信息 · 数据默认本地处理</p>
    </div>

    <!-- 清空对话确认弹窗 -->
    <ConfirmDialog
      v-model="showClearMsgConfirm"
      title="清空对话"
      desc="确定清空当前对话的所有消息吗？此操作不可撤销。"
      confirm-text="清空"
      danger
      @confirm="confirmClearMessages"
    />

    <!-- 重命名对话弹窗 -->
    <BaseModal v-model="showRenameModal" title="重命名对话" width="sm">
      <div>
        <label for="field-rename" class="block text-[12px] font-medium text-grey-700 mb-1.5">新名称</label>
        <input
          id="field-rename"
          ref="renameInput"
          v-model="renameValue"
          class="input"
          placeholder="对话名称"
          @keydown.enter="confirmRename"
        />
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showRenameModal = false">取消</button>
        <button class="btn-primary" @click="confirmRename">
          <Icon name="check" :size="14" />
          确认
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
/* ===== Markdown 渲染样式 ===== */
.prose-msg :deep(strong) { color: var(--text-default); font-weight: 600; }
.prose-msg :deep(em) { font-style: italic; color: var(--text-secondary); }
.prose-msg :deep(.md-p) { margin: 0; }
.prose-msg :deep(.md-p) + :deep(.md-p) { margin-top: 0.5em; }
.prose-msg :deep(.md-h1) { font-size: 1.15em; font-weight: 700; margin: 0.6em 0 0.3em; color: var(--text-default); }
.prose-msg :deep(.md-h2) { font-size: 1.05em; font-weight: 600; margin: 0.5em 0 0.3em; color: var(--text-default); }
.prose-msg :deep(.md-h3) { font-size: 1em; font-weight: 600; margin: 0.4em 0 0.2em; color: var(--text-default); }
.prose-msg :deep(.md-h4) { font-size: 0.95em; font-weight: 600; margin: 0.3em 0 0.2em; color: var(--text-secondary); }
.prose-msg :deep(code)  { font-family: 'JetBrains Mono', monospace; font-size: 0.78125rem; background: rgba(75,63,227,0.06); padding: 1px 5px; border-radius: 4px; color: var(--brand-active); }
.prose-msg :deep(.md-code-block) { background: #f6f5f3; border: 1px solid var(--border-neutral-l1); border-radius: 8px; padding: 10px 12px; margin: 8px 0; overflow-x: auto; }
.prose-msg :deep(.md-code-block code) { background: none; padding: 0; color: var(--text-default); font-size: 0.75rem; line-height: 1.6; }
.prose-msg :deep(table) { width: 100%; border-collapse: collapse; margin: 6px 0 4px; font-size: 0.78125rem; }
.prose-msg :deep(th), .prose-msg :deep(td) { border: 1px solid var(--border-neutral-l1); padding: 6px 8px; text-align: left; }
.prose-msg :deep(th) { background: rgba(115,115,115,0.04); font-weight: 500; }
.prose-msg :deep(.md-ul), .prose-msg :deep(.md-ol) { margin: 4px 0; padding-left: 1.4em; }
.prose-msg :deep(.md-ul li) { list-style: disc; margin: 2px 0; }
.prose-msg :deep(.md-ol li) { list-style: decimal; margin: 2px 0; }
.prose-msg :deep(.md-quote) { border-left: 3px solid rgba(75,63,227,0.3); padding: 4px 10px; margin: 6px 0; background: rgba(75,63,227,0.03); color: var(--text-secondary); }
.prose-msg :deep(.md-quote p) { margin: 0; }
.prose-msg :deep(.md-hr) { border: none; border-top: 1px solid var(--border-neutral-l1); margin: 10px 0; }
.prose-msg :deep(.md-link) { color: var(--brand-active); text-decoration: underline; text-underline-offset: 2px; }
ol > li { padding: 6px 6px; border-radius: 10px; }
ol > li:hover { background: rgba(115,115,115,0.04); }

@media (max-width: 767px) {
  /* 窄屏消息项间距收紧 */
  ol { gap: 12px; }
  ol > li { padding: 4px 2px; }
  /* 窄屏消息内表格字号缩小，避免横向溢出 */
  .prose-msg :deep(table) { font-size: 0.72rem; }
  .prose-msg :deep(th), .prose-msg :deep(td) { padding: 4px 6px; }
  /* 窄屏消息行内代码字号微调 */
  .prose-msg :deep(code) { font-size: 0.72rem; }
}
</style>
