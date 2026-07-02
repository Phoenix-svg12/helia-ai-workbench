/**
 * 轻量 Markdown 渲染器 —— 无第三方依赖。
 *
 * 支持：标题、粗体、斜体、行内代码、代码块、表格、有序/无序列表、引用块、链接、分隔线。
 * 安全策略：先 HTML 转义，再应用 Markdown 语法替换，防止 XSS。
 *
 * 面试说明：这是一个约 100 行的迷你 Markdown parser，
 * 覆盖了 LLM 回复中最常见的格式，足以替代 marked 等重型依赖。
 */

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, (c) => map[c])
}

/**
 * 将 Markdown 文本渲染为安全 HTML 字符串。
 * @param {string} md 原始 Markdown 文本
 * @returns {string} 渲染后的 HTML
 */
export function renderMarkdown(md) {
  if (!md) return ''

  // 1. 先转义 HTML，防止 XSS
  let text = escapeHtml(md)

  // 2. 提取代码块（```...```），用占位符替换，最后还原
  const codeBlocks = []
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre class="md-code-block"><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\x00CODEBLOCK${idx}\x00`
  })

  // 3. 提取行内代码（`code`），用占位符替换
  const inlineCodes = []
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length
    inlineCodes.push(`<code class="md-code-inline">${code}</code>`)
    return `\x00INLINE${idx}\x00`
  })

  // 4. 按行处理块级元素
  const lines = text.split('\n')
  const result = []
  let inTable = false
  let tableRows = []
  let inList = false
  let listType = '' // 'ul' or 'ol'
  let inQuote = false

  function flushTable() {
    if (!tableRows.length) return
    let html = '<table class="md-table"><thead><tr>'
    const headerCells = tableRows[0].split('|').map(c => c.trim()).filter(Boolean)
    headerCells.forEach(c => { html += `<th>${c}</th>` })
    html += '</tr></thead><tbody>'
    // 跳过分隔行（|---|---|）
    for (let i = 1; i < tableRows.length; i++) {
      if (/^[\s|-]+$/.test(tableRows[i])) continue
      html += '<tr>'
      const cells = tableRows[i].split('|').map(c => c.trim()).filter(Boolean)
      cells.forEach(c => { html += `<td>${c}</td>` })
      html += '</tr>'
    }
    html += '</tbody></table>'
    result.push(html)
    tableRows = []
  }

  function flushList() {
    if (!inList) return
    result.push(`</${listType}>`)
    inList = false
    listType = ''
  }

  function flushQuote() {
    if (!inQuote) return
    result.push('</blockquote>')
    inQuote = false
  }

  for (const line of lines) {
    // 代码块占位符行（不在此处还原，延迟到行内格式化之后）
    if (line.includes('\x00CODEBLOCK')) {
      flushTable(); flushList(); flushQuote()
      result.push(line)
      continue
    }

    // 表格行（包含 |）
    if (line.trim().includes('|') && line.trim().startsWith('|')) {
      flushList(); flushQuote()
      inTable = true
      tableRows.push(line.trim())
      continue
    } else if (inTable) {
      flushTable()
      inTable = false
    }

    // 引用块
    if (line.trim().startsWith('&gt; ')) {
      flushList()
      if (!inQuote) { result.push('<blockquote class="md-quote">'); inQuote = true }
      result.push(`<p>${line.trim().slice(5)}</p>`)
      continue
    } else if (inQuote) {
      flushQuote()
    }

    // 标题
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      result.push(`<h${level} class="md-h${level}">${headingMatch[2]}</h${level}>`)
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList()
      result.push('<hr class="md-hr" />')
      continue
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line.trim())) {
      if (!inList || listType !== 'ul') { flushList(); result.push('<ul class="md-ul">'); inList = true; listType = 'ul' }
      result.push(`<li>${line.trim().replace(/^[-*+]\s+/, '')}</li>`)
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line.trim())) {
      if (!inList || listType !== 'ol') { flushList(); result.push('<ol class="md-ol">'); inList = true; listType = 'ol' }
      result.push(`<li>${line.trim().replace(/^\d+\.\s+/, '')}</li>`)
      continue
    }

    // 非列表行，关闭列表
    if (inList) flushList()

    // 空行
    if (!line.trim()) {
      result.push('')
      continue
    }

    // 普通段落
    result.push(`<p class="md-p">${line}</p>`)
  }

  // 收尾
  if (inTable) flushTable()
  if (inList) flushList()
  if (inQuote) flushQuote()

  let html = result.join('\n')

  // 5. 行内格式：粗体、斜体、链接（在代码块占位符还原前执行，避免代码内容被格式化）
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  // 链接：过滤危险协议（javascript:/data:/vbscript:），仅允许 http(s)/mailto/tel
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = /^(https?:|mailto:|tel:)/i.test(url) ? url : '#'
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="md-link">${text}</a>`
  })

  // 6. 还原行内代码和代码块占位符（在行内格式化之后，保护代码内容）
  html = html.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlineCodes[+i])
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => codeBlocks[+i])

  return html
}
