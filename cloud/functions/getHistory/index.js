// 云函数：获取历史记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const limit = event.limit || 30

  try {
    // 查询历史索引
    const res = await db.collection('history_index')
      .orderBy('date', 'desc')
      .limit(limit)
      .get()

    if (res.data.length > 0) {
      // 如果有展开需求，可以附上完整的 material 数据
      // 默认只返回索引信息（轻量）
      const records = await Promise.all(
        res.data.map(async (entry) => {
          const detail = await db.collection('daily_materials')
            .where({ date: entry.date })
            .get()

          if (detail.data.length > 0) {
            const m = detail.data[0].material
            return {
              date: entry.date,
              title: entry.title,
              mode: entry.mode || m.mode || '',
              articleTitle: entry.articleTitle || (m.dailyArticle && m.dailyArticle.title) || '',
              articleUrl: entry.articleUrl || (m.dailyArticle && m.dailyArticle.url) || '',
              articleColumn: entry.articleColumn || (m.dailyArticle && m.dailyArticle.column) || '',
              articleCount: entry.articleCount || (m.dailyArticle ? 1 : 0),
              dailyArticle: m.dailyArticle,
              selectedArticle: m.selectedArticle,
              selection: m.selection,
              framework: m.framework,
              toolbox: m.toolbox,
              argument: m.argument,
              method: m.method,
              expression: m.expression,
              practice: m.practice,
              highlightQuotes: m.highlightQuotes,
              copyText: m.copyText || ''
            }
          }
          return entry
        })
      )

      return { success: true, records }
    }

    return { success: true, records: [] }
  } catch (err) {
    console.error('getHistory error:', err)
    return { success: false, error: err.message, records: [] }
  }
}
