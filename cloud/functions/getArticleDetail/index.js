// 云函数：获取文章详情
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { id } = event

  if (!id) {
    return { success: false, error: '缺少文章 ID', article: null }
  }

  try {
    // 从所有 daily_materials 中查找
    const res = await db.collection('daily_materials')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get()

    for (const record of res.data) {
      const allArticles = [
        ...(record.material.tier1 || []),
        ...(record.material.tier2 || []),
        ...(record.material.tier3 || [])
      ]
      const found = allArticles.find(a => a.id === id)
      if (found) {
        return { success: true, article: found }
      }
    }

    return { success: false, error: '未找到该文章', article: null }
  } catch (err) {
    console.error('getArticleDetail error:', err)
    return { success: false, error: err.message, article: null }
  }
}
