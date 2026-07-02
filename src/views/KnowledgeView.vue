<script setup>
import { ref, computed, onMounted } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useToastStore } from '@/stores/toast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BaseModal from '@/components/BaseModal.vue'
import Icon from '@/components/Icon.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'

const knowledge = useKnowledgeStore()
const toast = useToastStore()

/* ---------- 加载状态 ---------- */
const loading = ref(true)
onMounted(() => {
  // 模拟数据加载延迟，展示骨架屏
  setTimeout(() => { loading.value = false }, 400)
})

/* ---------- 文件上传 ---------- */
const fileInput = ref(null)
const uploading = ref(false)

function triggerFileUpload() {
  fileInput.value?.click()
}

async function onFileChange(e) {
  const files = [...e.target.files]
  if (!files.length) return
  uploading.value = true
  try {
    for (const f of files) {
      await knowledge.addFromFile(f)
      toast.push(`已导入「${f.name}」`, 'success')
    }
  } catch (err) {
    toast.push('文件读取失败：' + (err?.message || err), 'error')
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

/* ---------- 添加文本弹窗 ---------- */
const showTextModal = ref(false)
const textForm = ref({ name: '', content: '' })

function submitText() {
  const name = textForm.value.name.trim()
  const content = textForm.value.content.trim()
  if (!name) { toast.push('请输入文档名称', 'warn'); return }
  if (!content) { toast.push('请输入文档内容', 'warn'); return }
  knowledge.addText(name, content)
  toast.push(`已添加「${name}」`, 'success')
  textForm.value = { name: '', content: '' }
  showTextModal.value = false
}

/* ---------- 添加网页链接弹窗 ---------- */
const showUrlModal = ref(false)
const urlForm = ref({ url: '', title: '' })

function submitUrl() {
  const url = urlForm.value.url.trim()
  const title = urlForm.value.title.trim()
  if (!url) { toast.push('请输入网页链接', 'warn'); return }
  if (!/^https?:\/\//i.test(url)) { toast.push('请输入有效的 http(s) 链接', 'warn'); return }
  knowledge.addUrl(url, title || url)
  toast.push(`已添加链接「${title || url}」`, 'success')
  urlForm.value = { url: '', title: '' }
  showUrlModal.value = false
}

/* ---------- 检索演示 ---------- */
const searchInput = ref('')
const hasSearched = ref(false)

function doSearch() {
  const q = searchInput.value.trim()
  if (!q) { toast.push('请输入检索问题', 'warn'); return }
  knowledge.search(q, 5)
  hasSearched.value = true
}

function clearSearch() {
  searchInput.value = ''
  knowledge.clearSearch()
  hasSearched.value = false
}

/* ---------- 关键词高亮（先转义再包 mark，防 XSS） ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function highlight(text, query) {
  const safe = escapeHtml(text)
  if (!query || !query.trim()) return safe
  const words = (query.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g) || [])
    .filter(w => w.length > 1)
  if (!words.length) return safe
  // 用占位符保护 HTML 实体，避免搜索词匹配到实体内部
  const entities = []
  let html = safe.replace(/&(?:[a-zA-Z]+|#\d+);/g, m => {
    entities.push(m)
    return `\x00${entities.length - 1}\x00`
  })
  // 合并所有关键词为一个正则，一次性替换，避免多关键词交叉匹配产生破损 HTML
  const pattern = words
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
    .join('|')
  if (pattern) {
    const re = new RegExp(`(${pattern})`, 'gi')
    html = html.replace(re, m => `<mark style="background:rgba(245,158,11,0.28);color:#92400e;padding:0 2px;border-radius:2px;">${m}</mark>`)
  }
  // 恢复 HTML 实体
  html = html.replace(/\x00(\d+)\x00/g, (_, i) => entities[+i])
  return html
}

/* ---------- 文档操作 ---------- */
function openDoc(doc) {
  knowledge.selectDoc(doc.id)
  // 重置展开状态
  contentExpanded.value = false
  expandedChunks.value = new Set()
}

function closeDetail() {
  knowledge.selectDoc(null)
  contentExpanded.value = false
}

/* ---------- 内容展开/收起 ---------- */
const contentExpanded = ref(false)
const expandedChunks = ref(new Set())
function toggleChunk(idx) {
  if (expandedChunks.value.has(idx)) {
    expandedChunks.value.delete(idx)
  } else {
    expandedChunks.value.add(idx)
  }
  // 触发响应式更新
  expandedChunks.value = new Set(expandedChunks.value)
}
function isChunkExpanded(idx) {
  return expandedChunks.value.has(idx)
}

/* ---------- 删除 / 清空 ---------- */
const showDeleteConfirm = ref(false)
const pendingDeleteId = ref(null)

function askDelete(doc, e) {
  e?.stopPropagation()
  pendingDeleteId.value = doc.id
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!pendingDeleteId.value) return
  const doc = knowledge.documents.find(d => d.id === pendingDeleteId.value)
  knowledge.removeDoc(pendingDeleteId.value)
  if (doc) toast.push(`已删除「${doc.name}」`, 'info')
  pendingDeleteId.value = null
}

const showClearConfirm = ref(false)

function confirmClear() {
  knowledge.clearAll()
  hasSearched.value = false
  searchInput.value = ''
  toast.push('已清空知识库', 'info')
}

/* ---------- 格式化工具 ---------- */
function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function previewChunk(text, len = 100) {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > len ? t.slice(0, len) + '…' : t
}

/* ---------- 统计 ---------- */
const docCount = computed(() => knowledge.documents.length)
const totalChunks = computed(() => knowledge.totalChunks)

/* Esc 关闭弹窗由 BaseModal 统一处理，无需手写 onMounted/onBeforeUnmount */
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-6 pt-5 pb-4 shrink-0 hairline-b">
      <div class="flex items-end justify-between gap-3 mb-3">
        <div class="min-w-0">
          <h1 class="text-[22px] md:text-[24px] font-semibold tracking-tight text-grey-900">知识库</h1>
          <p class="text-[12.5px] text-grey-500 mt-1">参考 FastGPT/Dify 的 RAG 知识库：导入文档自动分块，输入问题即可检索命中片段。</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button class="btn-outline" :disabled="!docCount" @click="showClearConfirm = true">
            <Icon name="trash" :size="14" />
            清空
          </button>
        </div>
      </div>
      <!-- 统计 -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="chip">文档总数 {{ docCount }}</span>
        <span class="chip-accent">分块总数 {{ totalChunks }}</span>
        <span class="text-[11px] text-grey-400 font-mono ml-auto">本地存储 · 关键词检索（无向量模型）</span>
      </div>
    </div>

    <!-- Main -->
    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- ============ 左：文档管理区 ============ -->
        <div class="lg:col-span-1 flex flex-col gap-3 min-h-0">
          <!-- 添加按钮组 -->
          <div class="card p-3">
            <div class="grid grid-cols-3 gap-2">
              <button class="btn-outline flex flex-col items-center gap-1 py-2.5" :disabled="uploading" @click="triggerFileUpload">
                <Icon name="upload" :size="16" :class="uploading ? 'animate-pulse' : ''" />
                <span class="text-[11px]">{{ uploading ? '读取中' : '上传文件' }}</span>
              </button>
              <button class="btn-outline flex flex-col items-center gap-1 py-2.5" @click="showTextModal = true">
                <Icon name="doc" :size="16" />
                <span class="text-[11px]">添加文本</span>
              </button>
              <button class="btn-outline flex flex-col items-center gap-1 py-2.5" @click="showUrlModal = true">
                <Icon name="globe" :size="16" />
                <span class="text-[11px]">网页链接</span>
              </button>
            </div>
            <p class="text-[10.5px] text-grey-400 mt-2 text-center">支持 .txt / .md · 自动按段落分块</p>
            <input ref="fileInput" type="file" accept=".txt,.md" multiple class="hidden" @change="onFileChange" />
          </div>

          <!-- 文档列表 -->
          <div class="card flex flex-col" style="min-height: 320px;">
            <div class="px-4 py-3 hairline-b flex items-center justify-between">
              <span class="text-[13px] font-semibold text-grey-800">文档列表</span>
              <span class="text-[11px] text-grey-400 font-mono">{{ docCount }} 个</span>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto" style="max-height: 460px;">
              <!-- 骨架屏 -->
              <SkeletonLoader v-if="loading" type="list" :count="5" />
              <!-- 空状态 -->
              <div v-else-if="!docCount" class="px-6 py-12 text-center">
                <div class="w-12 h-12 rounded-full bg-grey-100 flex items-center justify-center mx-auto mb-3">
                  <Icon name="doc" :size="24" class="text-grey-400" />
                </div>
                <p class="text-[12px] text-grey-400">还没有文档</p>
                <p class="text-[11px] text-grey-400 mt-1">点击上方按钮导入内容</p>
              </div>
              <!-- 列表项 -->
              <div
                v-for="doc in knowledge.documents"
                :key="doc.id"
                role="button"
                tabindex="0"
                @click="openDoc(doc)"
                :class="['px-4 py-3 cursor-pointer hairline-b transition-colors group',
                         knowledge.selectedDocId === doc.id ? 'bg-brand-600/8' : 'hover:bg-grey-50']"
              >
                <div class="flex items-start gap-2.5">
                  <div class="w-7 h-7 rounded-md ring-1 ring-brand-600/15 flex items-center justify-center text-white text-[11px] font-semibold shrink-0" style="background:#4B3FE3;">
                    {{ doc.type === 'Markdown' ? 'M' : doc.type === '网页' ? 'W' : 'T' }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[12.5px] text-grey-800 font-semibold truncate">{{ doc.name }}</span>
                      <span v-if="doc.synced" class="chip-accent text-[9.5px]">已分块</span>
                      <span v-else class="chip-warn text-[9.5px]">待补录</span>
                    </div>
                    <div class="text-[10.5px] text-grey-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{{ doc.type }}</span>
                      <span class="text-grey-300">·</span>
                      <span>{{ doc.chunks?.length || 0 }} 分块</span>
                      <span class="text-grey-300">·</span>
                      <span>{{ formatSize(doc.size) }}</span>
                      <span class="text-grey-300">·</span>
                      <span>{{ doc.createdAt }}</span>
                    </div>
                  </div>
                  <button
                    class="icon-btn opacity-0 group-hover:opacity-100 !text-error hover:!bg-error/8 shrink-0"
                    title="删除文档"
                    @click="askDelete(doc, $event)"
                  >
                    <Icon name="trash" :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============ 右：检索 + 详情 ============ -->
        <div class="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <!-- 检索演示区 -->
          <div class="card flex flex-col">
            <div class="px-4 py-3 hairline-b flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="search" :size="16" class="text-brand-600" />
                <span class="text-[13px] font-semibold text-grey-800">检索测试</span>
              </div>
              <button v-if="hasSearched" class="text-[11px] text-grey-500 hover:text-grey-700" @click="clearSearch">清除结果</button>
            </div>
            <div class="p-4">
              <div class="flex gap-2">
                <input
                  v-model="searchInput"
                  class="input flex-1"
                  placeholder="输入问题，检索知识库命中分块…"
                  @keydown.enter="doSearch"
                />
                <button class="btn-primary" @click="doSearch">
                  <Icon name="search" :size="14" />
                  检索
                </button>
              </div>
              <!-- 结果区 -->
              <div class="mt-3">
                <!-- 未检索 -->
                <div v-if="!hasSearched" class="text-[12px] text-grey-400 text-center py-8">
                  输入问题后点击检索，将返回最相关的分块（Top 5）
                </div>
                <!-- 无结果 -->
                <div v-else-if="!knowledge.searchResults.length" class="text-[12px] text-grey-400 text-center py-8">
                  <Icon name="search" :size="32" class="mx-auto mb-2 text-grey-300" />
                  未命中任何分块，尝试换个问法或导入更多文档
                </div>
                <!-- 结果列表 -->
                <div v-else class="space-y-2">
                  <div
                    v-for="(r, i) in knowledge.searchResults"
                    :key="r.id"
                    class="rounded-lg p-3 transition-colors"
                    style="border: 1px solid rgba(115,115,115,0.14); background: rgba(248,248,247,0.6);"
                  >
                    <div class="flex items-center justify-between mb-1.5 gap-2">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="chip-accent text-[10px] shrink-0">#{{ i + 1 }}</span>
                        <span class="text-[11.5px] text-grey-800 font-medium truncate">{{ r.docName }}</span>
                        <span class="text-[10px] text-grey-400 shrink-0">分块 {{ r.index + 1 }}</span>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <div class="w-12 h-1 rounded-full bg-grey-200 overflow-hidden">
                          <div class="h-full rounded-full" :style="`width:${Math.round(r.score * 100)}%;background:#4B3FE3`"></div>
                        </div>
                        <span class="text-[11px] text-brand-500 font-mono tabular-nums">{{ (r.score * 100).toFixed(0) }}%</span>
                      </div>
                    </div>
                    <p class="text-[12px] text-grey-600 leading-relaxed" v-html="highlight(r.text, knowledge.searchQuery)"></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 文档详情面板 -->
          <div class="card flex-1 flex flex-col" style="min-height: 340px;">
            <!-- 空状态 -->
            <div v-if="!knowledge.selectedDoc" class="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div class="w-12 h-12 rounded-full bg-grey-100 flex items-center justify-center mb-3">
                <Icon name="doc" :size="24" class="text-grey-400" />
              </div>
              <p class="text-[12px] text-grey-400">点击左侧文档查看详情</p>
              <p class="text-[11px] text-grey-400 mt-1">元信息 · 分块列表 · 完整内容预览</p>
            </div>

            <!-- 详情内容 -->
            <template v-else>
              <div class="px-4 py-3 hairline-b flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[13px] font-semibold text-grey-800 truncate">文档详情</span>
                  <span class="chip text-[10px] shrink-0">{{ knowledge.selectedDoc.type }}</span>
                </div>
                <button class="icon-btn" title="关闭详情" @click="closeDetail">
                  <Icon name="close" :size="16" />
                </button>
              </div>

              <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <!-- 标题 -->
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg ring-1 ring-brand-600/15 flex items-center justify-center text-white font-semibold text-[15px] shrink-0" style="background:#4B3FE3;">
                    {{ knowledge.selectedDoc.type === 'Markdown' ? 'M' : knowledge.selectedDoc.type === '网页' ? 'W' : 'T' }}
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-[15px] font-semibold text-grey-900 break-words">{{ knowledge.selectedDoc.name }}</h3>
                    <div class="text-[11px] text-grey-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{{ knowledge.selectedDoc.type }}</span>
                      <span class="text-grey-300">·</span>
                      <span>{{ knowledge.selectedDoc.createdAt }}</span>
                      <span v-if="knowledge.selectedDoc.url" class="text-grey-300">·</span>
                      <a v-if="knowledge.selectedDoc.url" :href="knowledge.selectedDoc.url" target="_blank" rel="noopener" class="text-brand-600 hover:underline truncate max-w-[200px]">{{ knowledge.selectedDoc.url }}</a>
                    </div>
                    <p v-if="knowledge.selectedDoc.note" class="text-[10.5px] text-warning mt-1">{{ knowledge.selectedDoc.note }}</p>
                  </div>
                </div>

                <!-- 元信息网格 -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div class="rounded-lg bg-grey-100 p-2.5 text-center">
                    <div class="text-[10px] text-grey-400">类型</div>
                    <div class="text-[13px] text-grey-800 font-semibold mt-0.5">{{ knowledge.selectedDoc.type }}</div>
                  </div>
                  <div class="rounded-lg bg-grey-100 p-2.5 text-center">
                    <div class="text-[10px] text-grey-400">大小</div>
                    <div class="text-[13px] text-grey-800 font-semibold mt-0.5 tabular-nums">{{ formatSize(knowledge.selectedDoc.size) }}</div>
                  </div>
                  <div class="rounded-lg bg-grey-100 p-2.5 text-center">
                    <div class="text-[10px] text-grey-400">分块数</div>
                    <div class="text-[13px] text-grey-800 font-semibold mt-0.5 tabular-nums">{{ knowledge.selectedDoc.chunks?.length || 0 }}</div>
                  </div>
                  <div class="rounded-lg bg-grey-100 p-2.5 text-center">
                    <div class="text-[10px] text-grey-400">引用率</div>
                    <div class="text-[13px] text-brand-500 font-semibold mt-0.5 tabular-nums">{{ knowledge.selectedDoc.refRate || 0 }}%</div>
                  </div>
                </div>

                <!-- 分块列表 -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="text-[12.5px] font-semibold text-grey-700">分块列表</h4>
                    <span class="text-[10.5px] text-grey-400 font-mono">{{ knowledge.selectedDoc.chunks?.length || 0 }} 块</span>
                  </div>
                  <div v-if="knowledge.selectedDoc.chunks?.length" class="space-y-1.5">
                    <div
                      v-for="(chunk, idx) in knowledge.selectedDoc.chunks"
                      :key="idx"
                      class="rounded-md px-3 py-2 cursor-pointer transition-colors hover:bg-grey-50"
                      style="border: 1px solid rgba(115,115,115,0.12); background: rgba(248,248,247,0.5);"
                      @click="toggleChunk(idx)"
                    >
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-[10px] font-mono text-brand-600 shrink-0">#{{ idx + 1 }}</span>
                        <span class="text-[10px] text-grey-400 shrink-0">{{ chunk.length }} 字</span>
                        <Icon :name="isChunkExpanded(idx) ? 'chevL' : 'chevR'" :size="10" class="text-grey-400 ml-auto shrink-0" style="transform: rotate(90deg);" />
                      </div>
                      <p v-if="!isChunkExpanded(idx)" class="text-[11.5px] text-grey-600 leading-relaxed break-words">{{ previewChunk(chunk, 100) }}</p>
                      <p v-else class="text-[11.5px] text-grey-600 leading-relaxed break-words whitespace-pre-wrap">{{ chunk }}</p>
                    </div>
                  </div>
                  <div v-else class="text-[11.5px] text-grey-400 py-4 text-center rounded-md" style="border:1px dashed rgba(115,115,115,0.2);">
                    该文档暂无分块（网页类型需手动补录内容）
                  </div>
                </div>

                <!-- 完整内容预览 -->
                <div v-if="knowledge.selectedDoc.content">
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="text-[12.5px] font-semibold text-grey-700">完整内容</h4>
                    <button
                      class="text-[11px] text-brand-600 hover:text-brand-500 flex items-center gap-1"
                      @click="contentExpanded = !contentExpanded"
                    >
                      {{ contentExpanded ? '收起' : '展开全部' }}
                      <Icon :name="contentExpanded ? 'chevL' : 'chevR'" :size="10" style="transform: rotate(90deg);" />
                    </button>
                  </div>
                  <pre
                    class="text-[11.5px] text-grey-600 leading-relaxed whitespace-pre-wrap break-words rounded-lg p-3 overflow-y-auto transition-all"
                    :style="contentExpanded
                      ? 'background:rgba(248,248,247,0.6);border:1px solid rgba(115,115,115,0.12);max-height:none;'
                      : 'background:rgba(248,248,247,0.6);border:1px solid rgba(115,115,115,0.12);max-height:240px;'"
                  >{{ knowledge.selectedDoc.content }}</pre>
                </div>

                <!-- 操作 -->
                <div class="flex items-center gap-2 pt-1">
                  <button
                    class="btn-outline !text-error !border-error/20 hover:!bg-error/8"
                    @click="askDelete(knowledge.selectedDoc, $event)"
                  >
                    <Icon name="trash" :size="14" />
                    删除文档
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 添加文本弹窗（用 BaseModal） ============ -->
    <BaseModal
      v-model="showTextModal"
      title="手动添加文本"
      width="md"
    >
      <div class="space-y-3">
        <div>
          <label for="field-text-name" class="block text-[12px] font-medium text-grey-700 mb-1.5">文档名称</label>
          <input id="field-text-name" v-model="textForm.name" class="input" placeholder="例如：产品FAQ" @keydown.enter="$refs.textContent?.focus()" />
        </div>
        <div>
          <label for="field-text-content" class="block text-[12px] font-medium text-grey-700 mb-1.5">文档内容</label>
          <textarea id="field-text-content" ref="textContent" v-model="textForm.content" rows="6" class="input resize-none" placeholder="粘贴或输入文本内容，将自动按段落分块…"></textarea>
          <p class="text-[10.5px] text-grey-400 mt-1">每块约 300 字，按段落与句子切分</p>
        </div>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showTextModal = false">取消</button>
        <button class="btn-primary" @click="submitText">
          <Icon name="plus" :size="14" />
          添加
        </button>
      </template>
    </BaseModal>

    <!-- ============ 添加网页链接弹窗（用 BaseModal） ============ -->
    <BaseModal
      v-model="showUrlModal"
      title="添加网页链接"
      width="md"
    >
      <div class="space-y-3">
        <div>
          <label for="field-url-link" class="block text-[12px] font-medium text-grey-700 mb-1.5">网页 URL</label>
          <input id="field-url-link" v-model="urlForm.url" class="input" placeholder="https://example.com/article" @keydown.enter="$refs.urlTitle?.focus()" />
        </div>
        <div>
          <label for="field-url-title" class="block text-[12px] font-medium text-grey-700 mb-1.5">标题（可选）</label>
          <input id="field-url-title" ref="urlTitle" v-model="urlForm.title" class="input" placeholder="例如：行业白皮书 2025" @keydown.enter="submitUrl" />
        </div>
        <p class="text-[10.5px] text-warning rounded-md p-2" style="background:rgba(245,158,11,0.08);">
          注意：受浏览器跨域限制，网页正文需稍后通过「添加文本」手动粘贴补录。
        </p>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showUrlModal = false">取消</button>
        <button class="btn-primary" @click="submitUrl">
          <Icon name="plus" :size="14" />
          添加
        </button>
      </template>
    </BaseModal>

    <!-- 删除确认 -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="删除该文档？"
      desc="将移除该文档及其所有分块，已检索的引用不会受影响。删除后无法恢复。"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
    />

    <!-- 清空确认 -->
    <ConfirmDialog
      v-model="showClearConfirm"
      title="清空整个知识库？"
      desc="将移除所有文档与分块，并清除检索结果。此操作无法撤销。"
      confirm-text="全部清空"
      danger
      @confirm="confirmClear"
    />
  </div>
</template>
