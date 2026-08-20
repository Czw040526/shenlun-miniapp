// 云函数：发现、归档并读取《求是》杂志期刊目录
const cloud = require('wx-server-sdk')
const {
  QIUSHI_CATALOG_URL,
  normalizeIssueKey,
  issueScheduleForDate,
  findAnnualUrl,
  parseAnnualIssues,
  parseIssueArticleLinks
} = require('./qiushi-core')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COLLECTION = 'qiushi_issues'

exports.main = async (event = {}) => {
  if (event.action === 'backfill') return backfillYear(event)

  const targetDate = normalizeDate(event.date) || getTodayChinaDate()
  const requestedKey = normalizeIssueKey(event.issueKey)
  const schedule = requestedKey ? scheduleFromIssueKey(requestedKey) : issueScheduleForDate(targetDate)
  const force = event.force === true

  if (!schedule) return { success: false, error: '缺少有效日期或期号', data: null }

  try {
    const existing = await findIssue(schedule.issueKey)
    if (!force && isReadableIssue(existing && existing.material)) {
      return { success: true, cached: true, data: existing.material }
    }

    const available = await discoverIssues(schedule.year)
    let selected = available.find(item => item.issueKey === schedule.issueKey)
    let pendingIssueKey = ''

    if (!selected && !requestedKey) {
      selected = available.filter(item => item.issue <= schedule.issue).sort((a, b) => b.issue - a.issue)[0]
      pendingIssueKey = schedule.issueKey
    }

    if (!selected) {
      return {
        success: false,
        pending: true,
        error: `${schedule.title}官网目录暂未上线。`,
        data: null
      }
    }

    const selectedExisting = selected.issueKey === schedule.issueKey ? existing : await findIssue(selected.issueKey)
    if (!force && isReadableIssue(selectedExisting && selectedExisting.material)) {
      return {
        success: true,
        cached: true,
        pendingIssueKey,
        data: selectedExisting.material
      }
    }

    const archive = await archiveIssue(selected, selectedExisting)
    return { success: true, cached: false, pendingIssueKey, data: archive }
  } catch (err) {
    console.error('getQiushiIssue error:', err)
    return { success: false, error: err.message, data: null }
  }
}

async function backfillYear(event) {
  const today = normalizeDate(event.date) || getTodayChinaDate()
  const currentYear = Number(today.slice(0, 4))
  const requestedYear = Number(event.year || currentYear)
  const year = requestedYear >= 2019 && requestedYear <= currentYear ? requestedYear : currentYear

  try {
    const schedule = issueScheduleForDate(today)
    const available = (await discoverIssues(year)).filter(item => {
      if (year < currentYear) return true
      return item.issue <= schedule.issue && item.publishDate <= today
    })
    const stored = await db.collection(COLLECTION).where({ year }).limit(100).get()
    const storedByKey = new Map(stored.data.map(record => [record.issueKey, record]))
    const results = []
    const batchSize = 4

    for (let start = 0; start < available.length; start += batchSize) {
      const batch = available.slice(start, start + batchSize)
      const batchResults = await Promise.all(batch.map(async issueInfo => {
        const existing = storedByKey.get(issueInfo.issueKey)
        if (isReadableIssue(existing && existing.material)) {
          return { issueKey: issueInfo.issueKey, status: 'cached', articleCount: existing.material.articleCount }
        }
        try {
          const archive = await archiveIssue(issueInfo, existing)
          return { issueKey: issueInfo.issueKey, status: 'archived', articleCount: archive.articleCount }
        } catch (err) {
          console.warn(`回填${issueInfo.title}失败:`, err.message)
          return { issueKey: issueInfo.issueKey, status: 'failed', error: err.message }
        }
      }))
      results.push(...batchResults)
    }

    return {
      success: results.some(item => item.status !== 'failed') || available.length === 0,
      year,
      availableCount: available.length,
      archivedCount: results.filter(item => item.status === 'archived').length,
      cachedCount: results.filter(item => item.status === 'cached').length,
      failedCount: results.filter(item => item.status === 'failed').length,
      records: results
    }
  } catch (err) {
    console.error('getQiushiIssue backfill error:', err)
    return { success: false, year, error: err.message, records: [] }
  }
}

async function discoverIssues(year) {
  const catalogHtml = await fetchPage(QIUSHI_CATALOG_URL)
  const annualUrl = findAnnualUrl(catalogHtml, year, QIUSHI_CATALOG_URL)
  if (!annualUrl) throw new Error(`未找到《求是》${year}年目录。`)
  const annualHtml = await fetchPage(annualUrl)
  return parseAnnualIssues(annualHtml, year, annualUrl)
}

async function fetchPage(url) {
  const response = await cloud.callFunction({ name: 'fetchPage', data: { url } })
  const result = response.result || {}
  if (!result.success || !result.html) throw new Error(result.error || `无法读取 ${url}`)
  return result.html
}

async function archiveIssue(issueInfo, existing) {
  const html = await fetchPage(issueInfo.directoryUrl)
  const discoveredArticles = parseIssueArticleLinks(html, issueInfo.directoryUrl, issueInfo)
  if (!discoveredArticles.length) throw new Error(`已找到${issueInfo.title}目录，但未能识别文章列表。`)

  const articles = preserveArticleContent(discoveredArticles, existing && existing.material)
  const archive = {
    ...issueInfo,
    source: '求是网',
    sourceUrl: QIUSHI_CATALOG_URL,
    mode: 'qiushi-reader',
    periodical: '半月刊',
    publicationSchedule: '每月1日、16日出版',
    articleCount: articles.length,
    articles,
    updatedAtText: new Date().toISOString()
  }
  await saveIssue(existing, archive)
  return archive
}

async function findIssue(issueKey) {
  const result = await db.collection(COLLECTION).where({ issueKey }).limit(1).get()
  return result.data[0] || null
}

async function saveIssue(existing, archive) {
  const data = {
    issueKey: archive.issueKey,
    year: archive.year,
    issue: archive.issue,
    publishDate: archive.publishDate,
    title: archive.title,
    directoryUrl: archive.directoryUrl,
    articleCount: archive.articleCount,
    articles: archive.articles.map(articleSummary),
    material: archive,
    updatedAt: db.serverDate()
  }

  if (existing) {
    await db.collection(COLLECTION).doc(existing._id).update({ data })
  } else {
    await db.collection(COLLECTION).doc(archive.issueKey).set({ data: { ...data, createdAt: db.serverDate() } })
  }
}

function articleSummary(article) {
  const { paragraphs, content, ...summary } = article
  return summary
}

function preserveArticleContent(articles, previousArchive) {
  const previous = new Map(((previousArchive && previousArchive.articles) || []).map(article => [article.url, article]))
  return articles.map((article, index) => {
    const old = previous.get(article.url)
    return old && Array.isArray(old.paragraphs) && old.paragraphs.length
      ? { ...article, paragraphs: old.paragraphs, content: old.content, wordCount: old.wordCount, index }
      : { ...article, index }
  })
}

function isReadableIssue(issue) {
  return Boolean(issue && issue.mode === 'qiushi-reader' && Array.isArray(issue.articles) && issue.articles.length)
}

function scheduleFromIssueKey(issueKey) {
  const normalized = normalizeIssueKey(issueKey)
  if (!normalized) return null
  const [yearText, issueText] = normalized.split('-')
  const year = Number(yearText)
  const issue = Number(issueText)
  const month = Math.ceil(issue / 2)
  const day = issue % 2 === 1 ? '01' : '16'
  return {
    year,
    issue,
    issueKey: normalized,
    publishDate: `${year}-${String(month).padStart(2, '0')}-${day}`,
    title: `《求是》${year}年第${issue}期`
  }
}

function normalizeDate(value) {
  const date = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function getTodayChinaDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
