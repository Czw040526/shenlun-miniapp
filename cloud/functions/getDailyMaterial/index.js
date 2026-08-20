// 云函数：按日期抓取、归档并读取人民网观点文章
const cloud = require('wx-server-sdk')
const {
  COLUMN_URLS,
  MAX_ARTICLES,
  extractDateFromPeopleUrl,
  normalizeIdentity,
  parseArticleLinks,
  parseArticlePage,
  isReadableArticle,
  isReadableArchive
} = require('./article-core')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MATERIAL_COLLECTION = 'daily_materials'

exports.main = async (event = {}) => {
  const date = normalizeDate(event.date) || getTodayChinaDate()
  const force = event.force === true

  try {
    const existing = await findMaterial(date)
    const cachedArchive = existing && existing.material
    if (!force && isReadableArchive(cachedArchive)) {
      return { success: true, cached: true, data: cachedArchive }
    }

    const candidates = await collectArticles(date)
    const legacyCandidates = getLegacyCandidates(existing, date)
    const sourceArticles = candidates.length ? candidates : legacyCandidates
    if (!sourceArticles.length) {
      if (isReadableArchive(cachedArchive)) return { success: true, cached: true, data: cachedArchive }
      return {
        success: false,
        pending: true,
        error: `${date} 暂未抓取到人民网观点文章，请稍后刷新。`,
        data: null
      }
    }

    const articles = await hydrateArticles(sourceArticles, date)
    if (!articles.length) {
      if (isReadableArchive(cachedArchive)) return { success: true, cached: true, data: cachedArchive }
      return { success: false, error: '文章列表已找到，但正文抓取失败，请稍后刷新。', data: null }
    }

    const archive = {
      date,
      studyDate: date,
      title: `${date} 人民网观点`,
      source: '人民网观点频道',
      mode: 'article-reader',
      articleCount: articles.length,
      articles: articles.map((article, index) => ({ ...article, index })),
      updatedAtText: new Date().toISOString()
    }

    await saveArchive(existing, archive)
    return { success: true, cached: false, data: archive }
  } catch (err) {
    console.error('getDailyMaterial error:', err)
    return { success: false, error: err.message, data: null }
  }
}

async function collectArticles(date) {
  const collected = []
  const seenUrls = new Set()
  const seenTitles = new Set()

  for (const column of COLUMN_URLS) {
    try {
      const html = await fetchPage(column.url)
      parseArticleLinks(html, column)
        .filter(article => extractDateFromPeopleUrl(article.url) === date)
        .forEach(article => {
          const urlKey = normalizeIdentity(article.url)
          const titleKey = normalizeIdentity(article.title)
          if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) return
          seenUrls.add(urlKey)
          seenTitles.add(titleKey)
          collected.push({ ...article, publishDate: date })
        })
    } catch (err) {
      console.warn(`抓取${column.column}失败:`, err.message)
    }
  }

  return collected
    .sort((a, b) => Number(a.priority || 9) - Number(b.priority || 9))
    .slice(0, MAX_ARTICLES)
}

function getLegacyCandidates(record, date) {
  if (!record) return []
  const values = []
  const daily = record.material && (record.material.dailyArticle || record.material.selectedArticle)
  if (daily) values.push(daily)
  if (Array.isArray(record.articles)) values.push(...record.articles)
  if (record.material && Array.isArray(record.material.articles)) values.push(...record.material.articles)

  const seen = new Set()
  return values.filter(article => {
    const key = normalizeIdentity(article && article.url)
    if (!key || seen.has(key) || article.error || extractDateFromPeopleUrl(article.url) !== date) return false
    seen.add(key)
    return true
  }).slice(0, MAX_ARTICLES)
}

async function hydrateArticles(candidates, date) {
  const output = []
  const batchSize = 3
  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize)
    const results = await Promise.all(batch.map(async article => {
      try {
        const html = await fetchPage(article.url)
        const parsed = parseArticlePage(html, article, date)
        return isReadableArticle(parsed) ? parsed : null
      } catch (err) {
        console.warn(`正文抓取失败 ${article.title}:`, err.message)
        return null
      }
    }))
    output.push(...results.filter(Boolean))
  }
  return output
}

async function fetchPage(url) {
  const response = await cloud.callFunction({ name: 'fetchPage', data: { url } })
  const result = response.result || {}
  if (!result.success || !result.html) throw new Error(result.error || `无法读取 ${url}`)
  return result.html
}

async function findMaterial(date) {
  const result = await db.collection(MATERIAL_COLLECTION).where({ date }).limit(1).get()
  return result.data[0] || null
}

async function saveArchive(existing, archive) {
  const data = {
    date: archive.date,
    material: archive,
    articles: archive.articles,
    source: 'cloud-article-archive',
    updatedAt: db.serverDate()
  }

  if (existing) {
    await db.collection(MATERIAL_COLLECTION).doc(existing._id).update({ data })
  } else {
    await db.collection(MATERIAL_COLLECTION).add({ data: { ...data, createdAt: db.serverDate() } })
  }
}

function normalizeDate(value) {
  const date = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function getTodayChinaDate() {
  const china = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return china.toISOString().slice(0, 10)
}
