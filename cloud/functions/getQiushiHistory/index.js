// 云函数：读取独立的《求是》期刊历史存档
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const limit = Math.min(Math.max(Number(event.limit || 48), 1), 100)
  try {
    let sync = null
    if (event.sync !== false) {
      try {
        sync = await ensureCurrentYearBackfilled()
      } catch (err) {
        console.warn('《求是》年度历史同步失败:', err.message)
        sync = { success: false, error: err.message }
      }
    }
    const result = await db.collection('qiushi_issues')
      .orderBy('publishDate', 'desc')
      .limit(limit)
      .get()
    return { success: true, sync, records: result.data.map(normalizeRecord).filter(record => record.articles.length) }
  } catch (err) {
    console.error('getQiushiHistory error:', err)
    return { success: false, error: err.message, records: [] }
  }
}

async function ensureCurrentYearBackfilled() {
  const today = getTodayChinaDate()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  const expectedIssueCount = month * 2 - (day < 16 ? 1 : 0)
  const count = await db.collection('qiushi_issues').where({ year }).count()
  if (count.total >= expectedIssueCount) {
    return { success: true, skipped: true, year, storedCount: count.total }
  }

  const response = await cloud.callFunction({
    name: 'getQiushiIssue',
    data: { action: 'backfill', year, date: today }
  })
  return response.result || { success: false, year, error: '年度历史同步未返回结果' }
}

function getTodayChinaDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function normalizeRecord(record) {
  const material = record.material || record
  const articles = (material.articles || record.articles || []).map((article, index) => ({
    id: article.id || encodeURIComponent(article.url),
    index,
    title: article.title || '未命名文章',
    author: article.author || '',
    column: article.column || '《求是》',
    url: article.url,
    publishDate: article.publishDate || material.publishDate,
    wordCount: Number(article.wordCount || 0)
  })).filter(article => article.url)

  return {
    issueKey: material.issueKey || record.issueKey,
    year: Number(material.year || record.year),
    issue: Number(material.issue || record.issue),
    publishDate: material.publishDate || record.publishDate,
    title: material.title || record.title,
    articleCount: articles.length,
    articles
  }
}
