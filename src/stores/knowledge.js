import { defineStore } from 'pinia'

/**
 * 知识库 store —— 参考 FastGPT/Dify 的 RAG 知识库模型。
 *
 * 核心功能：
 *   1. 文档管理：上传 txt/md（FileReader 读取文本）、手动输入文本、网页链接
 *   2. 分块策略：按段落分块，每块约 300 字，可配置
 *   3. 检索：基于关键词匹配的简易检索（无向量模型时用 TF-IDF 思想）
 *   4. 绑定智能体：智能体对话时自动注入检索结果
 *
 * 数据结构：
 *   documents: [{ id, name, type, size, content, chunks, createdAt }]
 *   chunks:    [{ id, docId, docName, index, text, keywords }]
 */

// 分块：按段落 + 长度切分
function chunkText(text, maxLen = 300) {
  if (!text) return []
  // 先按双换行分段
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const chunks = []
  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      chunks.push(para)
    } else {
      // 长段落按句子切分
      const sentences = para.split(/(?<=[。！？.!?；;\n])/)
      let cur = ''
      for (const s of sentences) {
        if ((cur + s).length <= maxLen) {
          cur += s
        } else {
          if (cur) chunks.push(cur)
          cur = s
        }
      }
      if (cur) chunks.push(cur)
    }
  }
  return chunks
}

// 关键词提取：简单分词 + 去停用词
const STOP_WORDS = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'not', 'for', 'with'])

function extractKeywords(text) {
  // 中英文混合分词：中文按字 + 英文按空格
  const words = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z]+/g) || []
  const keywords = new Set()
  for (const w of words) {
    if (w.length <= 1) continue
    if (STOP_WORDS.has(w)) continue
    // 中文按 2-3 字滑窗提取关键词
    if (/[\u4e00-\u9fa5]/.test(w)) {
      for (let i = 0; i < w.length - 1; i++) {
        keywords.add(w.slice(i, i + 2))
      }
    } else {
      keywords.add(w)
    }
  }
  return [...keywords]
}

// 计算分块与查询的相关度（基于关键词重叠度）
function relevance(chunkKeywords, queryKeywords) {
  if (!chunkKeywords.length || !queryKeywords.length) return 0
  let hits = 0
  const set = new Set(chunkKeywords)
  for (const q of queryKeywords) {
    if (set.has(q)) hits++
  }
  return hits / queryKeywords.length
}

export const useKnowledgeStore = defineStore('knowledge', {
  state: () => ({
    documents: [],
    // 当前选中的文档（详情查看）
    selectedDocId: null,
    // 检索结果
    searchQuery: '',
    searchResults: []
  }),
  persist: ['documents'],
  getters: {
    totalChunks: (s) => s.documents.reduce((sum, d) => sum + (d.chunks?.length || 0), 0),
    selectedDoc: (s) => s.documents.find(d => d.id === s.selectedDocId) || null,
    // 所有分块的扁平索引
    allChunks: (s) => {
      const list = []
      for (const doc of s.documents) {
        if (!doc.chunks) continue
        doc.chunks.forEach((text, i) => {
          list.push({
            id: `${doc.id}-${i}`,
            docId: doc.id,
            docName: doc.name,
            index: i,
            text,
            keywords: extractKeywords(text)
          })
        })
      }
      return list
    }
  },
  actions: {
    /**
     * 上传文件：读取 txt/md 内容并分块
     */
    async addFromFile(file) {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.onerror = reject
        reader.readAsText(file)
      })
      const chunks = chunkText(text)
      const doc = {
        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name: file.name,
        type: file.name.endsWith('.md') ? 'Markdown' : file.name.endsWith('.txt') ? '文本' : file.name.split('.').pop() || '文本',
        size: file.size,
        content: text,
        chunks,
        createdAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        synced: true,
        refRate: 0
      }
      this.documents.unshift(doc)
      return doc
    },

    /**
     * 手动添加文本
     */
    addText(name, text) {
      const chunks = chunkText(text)
      const doc = {
        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name: name || '手动输入',
        type: '文本',
        size: text.length,
        content: text,
        chunks,
        createdAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        synced: true,
        refRate: 0
      }
      this.documents.unshift(doc)
      return doc
    },

    /**
     * 添加网页链接（前端无法跨域抓取，仅记录 URL，内容需用户手动粘贴）
     */
    addUrl(url, title) {
      const doc = {
        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name: title || url,
        type: '网页',
        url,
        size: 0,
        content: '',
        chunks: [],
        createdAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        synced: false,
        refRate: 0,
        note: '网页内容需手动粘贴（浏览器跨域限制）'
      }
      this.documents.unshift(doc)
      return doc
    },

    /**
     * 检索：输入查询，返回最相关的分块
     * 重构：命中时累加对应文档的 refRate（替代永远为 0 的假数据）
     */
    search(query, topK = 3) {
      if (!query.trim()) {
        this.searchResults = []
        return []
      }
      this.searchQuery = query
      const results = this._searchInternal(query, topK)

      // 真实统计 refRate：命中的文本文档引用率 +1（网页类型因无正文不计）
      const hitDocIds = new Set(results.map(r => r.docId))
      for (const doc of this.documents) {
        if (hitDocIds.has(doc.id) && doc.type !== '网页') {
          doc.refRate = (doc.refRate || 0) + 1
        }
      }

      this.searchResults = results
      return results
    },

    /**
     * 无副作用的内部检索方法（供 buildContext 使用，不修改 searchResults/searchQuery/refRate）
     */
    _searchInternal(query, topK = 3) {
      if (!query.trim()) return []
      const queryKeywords = extractKeywords(query)
      const scored = this.allChunks.map(c => ({
        ...c,
        score: relevance(c.keywords, queryKeywords)
      }))
      return scored
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    },

    /**
     * 构建知识库上下文（供对话注入）：把检索结果拼接成 context
     * 使用无副作用的 _searchInternal，避免污染知识库页面的搜索状态
     */
    buildContext(query, topK = 3) {
      const results = this._searchInternal(query, topK)
      if (!results.length) return ''
      return results.map((r, i) =>
        `[来源${i + 1}: ${r.docName} · 分块${r.index + 1}]\n${r.text}`
      ).join('\n\n---\n\n')
    },

    selectDoc(id) { this.selectedDocId = id },
    /** 清除检索结果 */
    clearSearch() {
      this.searchResults = []
      this.searchQuery = ''
    },
    removeDoc(id) {
      const idx = this.documents.findIndex(d => d.id === id)
      if (idx >= 0) this.documents.splice(idx, 1)
      if (this.selectedDocId === id) this.selectedDocId = null
    },
    clearAll() {
      this.documents = []
      this.selectedDocId = null
      this.searchResults = []
      this.searchQuery = ''
    }
  }
})

