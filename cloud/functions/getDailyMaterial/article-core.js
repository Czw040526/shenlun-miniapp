const COLUMN_URLS = [
  { column: '观点首页', priority: 1, url: 'http://opinion.people.com.cn/' },
  { column: '人民锐评', priority: 1, url: 'http://opinion.people.com.cn/GB/223228/index.html' },
  { column: '人民时评', priority: 1, url: 'http://opinion.people.com.cn/GB/40604/index.html' },
  { column: '今日谈', priority: 1, url: 'http://opinion.people.com.cn/GB/51854/index.html' }
]

const MAX_ARTICLES = 12

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function normalizePeopleUrl(href, baseUrl) {
  if (!href) return ''
  const clean = decodeHtml(href).trim()
  if (/^https?:\/\//i.test(clean)) return clean
  try {
    return new URL(clean, baseUrl || 'http://opinion.people.com.cn/').toString()
  } catch (err) {
    return ''
  }
}

function extractDateFromPeopleUrl(url) {
  const match = String(url || '').match(/\/n1\/(\d{4})\/(\d{2})(\d{2})\//)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function normalizeIdentity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/[\s“”‘’《》【】（）()：:，,。.!！?？\-_/]/g, '')
}

function parseArticleLinks(html, columnInfo) {
  const source = String(html || '')
  const info = columnInfo || {}
  const articles = []
  const seen = new Set()
  const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match

  while ((match = linkRegex.exec(source)) !== null) {
    const attrs = match[1] || ''
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue

    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)
    const title = stripTags(titleMatch ? titleMatch[1] : match[2])
    const url = normalizePeopleUrl(hrefMatch[1], info.url)
    const key = normalizeIdentity(url)
    if (title.length < 4 || !url.includes('opinion.people.com.cn/n1/') || !key || seen.has(key)) continue

    seen.add(key)
    articles.push({
      id: encodeURIComponent(url),
      column: info.column || '人民网观点',
      priority: Number(info.priority || 1),
      title,
      url
    })
  }

  return articles
}

function extractMeta(html, names) {
  const source = String(html || '')
  const tags = source.match(/<meta\b[^>]*>/gi) || []
  const expected = new Set((names || []).map(name => String(name).toLowerCase()))

  for (const tag of tags) {
    const marker = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)
    if (marker && content && expected.has(marker[1].toLowerCase())) return stripTags(content[1])
  }
  return ''
}

function extractContentHtml(html) {
  const source = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const start = /<div[^>]+class=["'][^"']*(?:rm_txt_con|artDet|show_text|text_con|article_content)[^"']*["'][^>]*>/i.exec(source)
  if (!start) return source

  const tail = source.slice(start.index + start[0].length)
  const endMarkers = [
    /<div[^>]+class=["'][^"']*(?:edit|editor|page_n|share|copyright)[^"']*["']/i,
    /<!--\s*(?:责任编辑|文章内容结束|end)/i,
    /<\/article>/i
  ]
  const endings = endMarkers
    .map(pattern => pattern.exec(tail))
    .filter(Boolean)
    .map(match => match.index)
  return endings.length ? tail.slice(0, Math.min(...endings)) : tail
}

function normalizeParagraph(value) {
  return stripTags(value)
    .replace(/\s+/g, ' ')
    .trim()
}

function parseArticlePage(html, fallbackArticle, targetDate) {
  const source = String(html || '')
  const body = extractContentHtml(source)
  const paragraphs = []
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let match

  while ((match = pRegex.exec(body)) !== null) {
    const text = normalizeParagraph(match[1])
    if (!text || /^(打开客户端|扫码|分享至|责任编辑[：:]?)/.test(text)) continue
    if (!paragraphs.includes(text)) paragraphs.push(text)
  }

  if (!paragraphs.length) {
    stripTags(body).split(/\n+/).forEach(line => {
      const text = normalizeParagraph(line)
      if (text.length > 8 && !paragraphs.includes(text)) paragraphs.push(text)
    })
  }

  const h1Match = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  const title = stripTags(h1Match ? h1Match[1] : '') ||
    extractMeta(source, ['og:title', 'article:title']) ||
    fallbackArticle.title
  const pageText = stripTags(source)
  const sourceMatch = pageText.match(/来源[：:]\s*([^\s|]{2,30})/)
  const authorMatch = pageText.match(/(?:作者|记者)[：:]\s*([^\s|]{2,30})/)

  return {
    ...fallbackArticle,
    title,
    publishDate: extractDateFromPeopleUrl(fallbackArticle.url) || targetDate,
    source: sourceMatch ? sourceMatch[1] : '人民网',
    author: authorMatch ? authorMatch[1] : '',
    paragraphs,
    content: paragraphs.join('\n\n'),
    wordCount: paragraphs.join('').length
  }
}

function isReadableArticle(article) {
  return Boolean(article && Array.isArray(article.paragraphs) && article.paragraphs.length && article.wordCount >= 80)
}

function isReadableArchive(value) {
  return Boolean(value && value.mode === 'article-reader' && Array.isArray(value.articles) && value.articles.some(isReadableArticle))
}

function articleSummary(article, index) {
  return {
    id: article.id,
    index,
    column: article.column,
    title: article.title,
    url: article.url,
    publishDate: article.publishDate,
    source: article.source,
    author: article.author,
    wordCount: article.wordCount
  }
}

module.exports = {
  COLUMN_URLS,
  MAX_ARTICLES,
  decodeHtml,
  stripTags,
  normalizePeopleUrl,
  extractDateFromPeopleUrl,
  normalizeIdentity,
  parseArticleLinks,
  parseArticlePage,
  isReadableArticle,
  isReadableArchive,
  articleSummary
}
