const http = require('http')
const https = require('https')

const COLUMN_URLS = [
  { column: '人民锐评', priority: 1, url: 'http://opinion.people.com.cn/GB/223228/index.html' },
  { column: '人民时评', priority: 1, url: 'http://opinion.people.com.cn/GB/40604/index.html' },
  { column: '今日谈', priority: 1, url: 'http://opinion.people.com.cn/GB/51854/index.html' },
  { column: '人民论坛', priority: 2, url: 'http://opinion.people.com.cn/GB/41166/index.html' },
  { column: '金台随笔', priority: 2, url: 'http://opinion.people.com.cn/GB/41167/index.html' },
  { column: '治理之道', priority: 3, url: 'http://opinion.people.com.cn/GB/41168/index.html' },
  { column: '壹时评', priority: 3, url: 'http://opinion.people.com.cn/GB/8213/420650/index.html' }
]

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
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

function parseArticleLinks(html, columnInfo) {
  const source = String(html || '')
  const info = columnInfo || {}
  const seenUrls = new Set()
  const seenTitles = new Set()
  const articles = []
  const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match

  while ((match = linkRegex.exec(source)) !== null) {
    const attrs = match[1] || ''
    const inner = match[2] || ''
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue

    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)
    const title = stripTags(titleMatch ? titleMatch[1] : inner)
    const url = normalizePeopleUrl(hrefMatch[1], info.url)
    const urlKey = normalizeArticleIdentity(url)
    const titleKey = normalizeArticleIdentity(title)
    if (!title || title.length < 4) continue
    if (!url.includes('opinion.people.com.cn') || !url.includes('/n1/')) continue
    if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue

    seenUrls.add(urlKey)
    seenTitles.add(titleKey)
    articles.push({
      id: encodeURIComponent(url),
      column: info.column || '人民网观点',
      priority: info.priority || 1,
      title,
      url
    })
  }

  return articles
}

function filterArticlesByDate(articles, targetDate) {
  return articles.filter(item => extractDateFromPeopleUrl(item && item.url) === targetDate)
}

function extractDateFromPeopleUrl(url) {
  const match = String(url || '').match(/\/n1\/(\d{4})\/(\d{2})(\d{2})\//)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function normalizeArticleIdentity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/[\s“”‘’《》【】（）()：:，,。.!！?？\-_/]/g, '')
}

function decodeBuffer(buffer, contentType) {
  const charsetMatch = String(contentType || '').match(/charset=([^;\s]+)/i)
  const charset = charsetMatch ? charsetMatch[1].toLowerCase() : ''
  if (charset.includes('gb')) {
    return new TextDecoder('gb18030').decode(buffer)
  }
  const head = buffer.toString('ascii', 0, Math.min(buffer.length, 500)).toLowerCase()
  if (head.includes('charset=gb') || head.includes('charset="gb')) {
    return new TextDecoder('gb18030').decode(buffer)
  }
  return buffer.toString('utf8')
}

function fetchText(url, redirectCount = 0) {
  if (redirectCount > 4) return Promise.reject(new Error(`Too many redirects: ${url}`))
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 shenlun-material-admin',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 20000
    }, res => {
      const location = res.headers.location
      if (res.statusCode >= 300 && res.statusCode < 400 && location) {
        res.resume()
        fetchText(new URL(location, url).toString(), redirectCount + 1).then(resolve, reject)
        return
      }

      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const body = decodeBuffer(Buffer.concat(chunks), res.headers['content-type'])
        resolve(body)
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error(`Fetch timeout: ${url}`))
    })
    req.on('error', reject)
  })
}

async function collectArticles(targetDate, limitPerColumn = 8) {
  const all = []
  const seenUrls = new Set()
  const seenTitles = new Set()

  for (const column of COLUMN_URLS) {
    try {
      const html = await fetchText(column.url)
      const parsed = parseArticleLinks(html, column)
      const sameDay = filterArticlesByDate(parsed, targetDate)
      const selected = sameDay.slice(0, limitPerColumn)

      selected.forEach(article => {
        const urlKey = normalizeArticleIdentity(article.url)
        const titleKey = normalizeArticleIdentity(article.title)
        if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) return
        seenUrls.add(urlKey)
        seenTitles.add(titleKey)
        all.push({
          ...article,
          publishDate: targetDate,
          originalDate: targetDate
        })
      })
    } catch (err) {
      all.push({
        id: `error-${column.column}`,
        column: column.column,
        priority: column.priority,
        title: `${column.column} 抓取失败：${err.message}`,
        url: column.url,
        error: err.message
      })
    }
  }
  return all
}

module.exports = {
  COLUMN_URLS,
  normalizePeopleUrl,
  parseArticleLinks,
  filterArticlesByDate,
  extractDateFromPeopleUrl,
  fetchText,
  collectArticles
}
