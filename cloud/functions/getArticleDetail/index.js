// 云函数：读取一篇已归档文章，并返回前后篇位置
const cloud = require('wx-server-sdk')
const { parseQiushiArticlePage, isReadableArticle } = require('./qiushi-core')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  if (event.source === 'qiushi') return readQiushiArticle(event)

  const date = String(event.date || '')
  const requestedIndex = Number(event.index)
  const id = String(event.id || '')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: '缺少有效日期', article: null }
  }

  try {
    let archive = await readArchive(date)
    if (!archive || !Array.isArray(archive.articles) || !archive.articles.length || !hasReadableContent(archive.articles)) {
      const synced = await cloud.callFunction({ name: 'getDailyMaterial', data: { date } })
      archive = synced.result && synced.result.data
    }

    const articles = archive && Array.isArray(archive.articles) ? archive.articles : []
    let index = Number.isInteger(requestedIndex) ? requestedIndex : -1
    if (id) {
      const foundIndex = articles.findIndex(article => article.id === id)
      if (foundIndex >= 0) index = foundIndex
    }
    if (index < 0 || index >= articles.length) index = 0
    if (!articles[index]) return { success: false, error: '未找到该文章', article: null }

    return {
      success: true,
      date,
      index,
      total: articles.length,
      hasPrevious: index > 0,
      hasNext: index < articles.length - 1,
      article: articles[index]
    }
  } catch (err) {
    console.error('getArticleDetail error:', err)
    return { success: false, error: err.message, article: null }
  }
}

async function readQiushiArticle(event) {
  const issueKey = normalizeIssueKey(event.issueKey)
  const requestedIndex = Number(event.index)
  const id = String(event.id || '')
  if (!issueKey) return { success: false, error: '缺少有效《求是》期号', article: null }

  try {
    let result = await readQiushiArchive(issueKey)
    if (!result.archive || !Array.isArray(result.archive.articles) || !result.archive.articles.length) {
      const synced = await cloud.callFunction({ name: 'getQiushiIssue', data: { issueKey } })
      if (!synced.result || !synced.result.success) {
        return { success: false, error: synced.result && synced.result.error || '未找到该期《求是》', article: null }
      }
      result = await readQiushiArchive(issueKey)
    }

    const archive = result.archive
    const articles = archive && Array.isArray(archive.articles) ? archive.articles.slice() : []
    let index = Number.isInteger(requestedIndex) ? requestedIndex : -1
    if (id) {
      const foundIndex = articles.findIndex(article => article.id === id)
      if (foundIndex >= 0) index = foundIndex
    }
    if (index < 0 || index >= articles.length) index = 0
    if (!articles[index]) return { success: false, error: '未找到该文章', article: null }

    if (!isReadableArticle(articles[index])) {
      const html = await fetchPage(articles[index].url)
      const parsed = parseQiushiArticlePage(html, articles[index])
      if (!isReadableArticle(parsed)) return { success: false, error: '正文抓取失败，请稍后重试。', article: null }
      articles[index] = parsed
      const nextArchive = { ...archive, articles, updatedAtText: new Date().toISOString() }
      await db.collection('qiushi_issues').doc(result.record._id).update({
        data: { material: nextArchive, articles: articles.map(articleSummary), updatedAt: db.serverDate() }
      })
    }

    return {
      success: true,
      source: 'qiushi',
      issueKey,
      date: archive.publishDate,
      issueTitle: archive.title,
      index,
      total: articles.length,
      hasPrevious: index > 0,
      hasNext: index < articles.length - 1,
      article: articles[index]
    }
  } catch (err) {
    console.error('getArticleDetail qiushi error:', err)
    return { success: false, error: err.message, article: null }
  }
}

function articleSummary(article) {
  const { paragraphs, content, ...summary } = article
  return summary
}

async function readQiushiArchive(issueKey) {
  const result = await db.collection('qiushi_issues').where({ issueKey }).limit(1).get()
  const record = result.data[0] || null
  return { record, archive: record && (record.material || record) }
}

async function fetchPage(url) {
  const response = await cloud.callFunction({ name: 'fetchPage', data: { url } })
  const result = response.result || {}
  if (!result.success || !result.html) throw new Error(result.error || `无法读取 ${url}`)
  return result.html
}

function normalizeIssueKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})$/)
  if (!match) return ''
  const issue = Number(match[2])
  return issue >= 1 && issue <= 24 ? `${match[1]}-${String(issue).padStart(2, '0')}` : ''
}

async function readArchive(date) {
  const result = await db.collection('daily_materials').where({ date }).limit(1).get()
  return result.data.length ? result.data[0].material : null
}

function hasReadableContent(articles) {
  return articles.some(article => Array.isArray(article.paragraphs) && article.paragraphs.length)
}
