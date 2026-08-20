function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&emsp;|&nbsp;/g, ' ')
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function extractDetailHtml(html) {
  const source = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const start = /<div\b[^>]*\bid=["']detailContent["'][^>]*>/i.exec(source)
  if (!start) return source
  const tail = source.slice(start.index + start[0].length)
  const end = /<div\b[^>]*class=["'][^"']*(?:xl_ewm|fs-text|sharebox)[^"']*["']/i.exec(tail)
  return end ? tail.slice(0, end.index) : tail
}

function parseQiushiArticlePage(html, fallbackArticle) {
  const source = String(html || '')
  const body = extractDetailHtml(source)
  const paragraphs = []
  const paragraphRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let match

  while ((match = paragraphRegex.exec(body)) !== null) {
    const text = stripTags(match[1]).replace(/\s+/g, ' ').trim()
    if (!text || /^(扫描二维码|网站编辑|责任编辑|校对[：:]?)/.test(text)) continue
    if (!paragraphs.includes(text)) paragraphs.push(text)
  }

  const h1 = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  const detailStart = source.search(/\bid=["']detailContent["']/i)
  const metaText = stripTags(source.slice(0, detailStart >= 0 ? detailStart : 0))
  const author = metaText.match(/作者[：:]\s*(.+?)\s+\d{4}-\d{2}-\d{2}/)
  const sourceName = metaText.match(/来源[：:]\s*(《求是》\d{4}\/\d{1,2})/)
  const article = fallbackArticle || {}

  return {
    ...article,
    title: stripTags(h1 ? h1[1] : '') || article.title || '未命名文章',
    column: '《求是》',
    source: sourceName ? sourceName[1] : (article.source || '《求是》'),
    author: author ? author[1].trim() : (article.author || ''),
    paragraphs,
    content: paragraphs.join('\n\n'),
    wordCount: paragraphs.join('').length
  }
}

function isReadableArticle(article) {
  return Boolean(article && Array.isArray(article.paragraphs) && article.paragraphs.length && Number(article.wordCount || 0) >= 80)
}

module.exports = { parseQiushiArticlePage, isReadableArticle }
