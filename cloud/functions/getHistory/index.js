// 云函数：读取按日期归档的文章列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const limit = Math.min(Math.max(Number(event.limit || 60), 1), 100)
  try {
    const result = await db.collection('daily_materials')
      .orderBy('date', 'desc')
      .limit(limit)
      .get()

    const records = result.data.map(record => normalizeRecord(record)).filter(record => record.articles.length)
    return { success: true, records }
  } catch (err) {
    console.error('getHistory error:', err)
    return { success: false, error: err.message, records: [] }
  }
}

function normalizeRecord(record) {
  const material = record.material || {}
  const source = Array.isArray(material.articles) ? material.articles : (record.articles || [])
  const first = material.dailyArticle || material.selectedArticle
  const values = first ? [first, ...source] : source
  const seen = new Set()
  const articles = values.filter(article => {
    const key = String(article && article.url || '')
    if (!key || article.error || seen.has(key)) return false
    seen.add(key)
    return true
  }).map((article, index) => ({
    id: article.id || encodeURIComponent(article.url),
    index,
    title: article.title || '未命名文章',
    column: article.column || '人民网观点',
    url: article.url,
    publishDate: article.publishDate || article.originalDate || record.date,
    wordCount: Number(article.wordCount || 0)
  }))

  return {
    date: record.date,
    title: `${record.date} 人民网观点`,
    articleCount: articles.length,
    articles
  }
}
