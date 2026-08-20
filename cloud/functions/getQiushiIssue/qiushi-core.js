const QIUSHI_CATALOG_URL = 'https://www.qstheory.cn/qs/mulu.htm'

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

function normalizeUrl(href, baseUrl) {
  const value = decodeHtml(href).trim()
  if (!value) return ''
  try {
    return new URL(value, baseUrl || QIUSHI_CATALOG_URL).toString()
  } catch (err) {
    return ''
  }
}

function normalizeIssueKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})$/)
  if (!match) return ''
  const year = Number(match[1])
  const issue = Number(match[2])
  if (year < 2019 || issue < 1 || issue > 24) return ''
  return `${year}-${String(issue).padStart(2, '0')}`
}

function issueScheduleForDate(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const issue = month * 2 - (day < 16 ? 1 : 0)
  return {
    year,
    issue,
    issueKey: `${year}-${String(issue).padStart(2, '0')}`,
    publishDate: issuePublishDate(year, issue),
    title: `《求是》${year}年第${issue}期`
  }
}

function issuePublishDate(year, issue) {
  const safeIssue = Number(issue)
  const month = Math.ceil(safeIssue / 2)
  const day = safeIssue % 2 === 1 ? 1 : 16
  return `${Number(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseLinks(html, baseUrl) {
  const links = []
  const regex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(String(html || ''))) !== null) {
    const href = (match[1] || '').match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!href) continue
    links.push({
      url: normalizeUrl(href[1], baseUrl),
      text: stripTags(match[2])
    })
  }
  return links
}

function findAnnualUrl(html, year, baseUrl) {
  const pattern = new RegExp(`(?:《求是》)?${Number(year)}年`)
  const link = parseLinks(html, baseUrl).find(item => pattern.test(item.text) && /qstheory\.cn\/\d{8}\//.test(item.url))
  return link ? link.url : ''
}

function parseAnnualIssues(html, year, baseUrl) {
  const output = []
  const seen = new Set()
  const pattern = new RegExp(`《求是》${Number(year)}年第(\\d{1,2})期`)

  parseLinks(html, baseUrl).forEach(link => {
    const match = link.text.match(pattern)
    if (!match || !/qstheory\.cn\/\d{8}\//.test(link.url)) return
    const issue = Number(match[1])
    if (issue < 1 || issue > 24 || seen.has(issue)) return
    seen.add(issue)
    output.push({
      issueKey: `${Number(year)}-${String(issue).padStart(2, '0')}`,
      year: Number(year),
      issue,
      title: `《求是》${Number(year)}年第${issue}期`,
      publishDate: issuePublishDate(year, issue),
      directoryUrl: link.url
    })
  })

  return output.sort((a, b) => a.issue - b.issue)
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

function parseIssueArticleLinks(html, directoryUrl, issueInfo) {
  const body = extractDetailHtml(html)
  const articles = []
  const seen = new Set()
  const paragraphs = body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []

  paragraphs.forEach(paragraph => {
    const links = parseLinks(paragraph, directoryUrl)
      .filter(link => /https?:\/\/www\.qstheory\.cn\/\d{8}\/[0-9a-f]+\/c\.html/i.test(link.url))
    if (!links.length) return

    const url = links[0].url
    if (!url || url === directoryUrl || seen.has(url)) return
    const titleParts = [...new Set(links.filter(link => link.url === url).map(link => link.text).filter(Boolean))]
    const title = titleParts.join('').replace(/\s+/g, ' ').trim()
    if (!title || /^《求是》\d{4}年$/.test(title)) return

    const paragraphText = stripTags(paragraph)
    const authorMatch = paragraphText.match(/[\/／]\s*([^\/／]+)$/)
    seen.add(url)
    articles.push({
      id: encodeURIComponent(url),
      index: articles.length,
      column: '《求是》',
      title,
      author: authorMatch ? authorMatch[1].trim() : '',
      url,
      publishDate: issueInfo.publishDate,
      issueKey: issueInfo.issueKey,
      issue: issueInfo.issue,
      source: `《求是》${issueInfo.year}/${String(issueInfo.issue).padStart(2, '0')}`,
      wordCount: 0
    })
  })

  return articles
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
  const beforeBody = source.slice(0, Math.max(source.search(/\bid=["']detailContent["']/i), 0))
  const metaText = stripTags(beforeBody)
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

module.exports = {
  QIUSHI_CATALOG_URL,
  decodeHtml,
  stripTags,
  normalizeUrl,
  normalizeIssueKey,
  issueScheduleForDate,
  issuePublishDate,
  findAnnualUrl,
  parseAnnualIssues,
  parseIssueArticleLinks,
  parseQiushiArticlePage,
  isReadableArticle
}
