// 云函数：发布后台生成的成品稿到小程序数据库
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  try {
    const payload = parsePayload(event)
    const expectedSecret = process.env.PUBLISH_ADMIN_SECRET || ''
    if (expectedSecret && payload.adminSecret !== expectedSecret) {
      return { success: false, error: '发布密钥不正确' }
    }

    const material = payload.material || {}
    const articles = Array.isArray(payload.articles) ? payload.articles : []
    const validationError = validateMaterial(material)
    if (validationError) {
      return { success: false, error: validationError }
    }

    const record = {
      date: material.date,
      material,
      articles,
      source: 'web-admin',
      updatedAt: db.serverDate()
    }

    const existing = await db.collection('daily_materials')
      .where({ date: material.date })
      .get()

    let recordId = ''
    if (existing.data.length > 0) {
      recordId = existing.data[0]._id
      await db.collection('daily_materials').doc(recordId).update({
        data: record
      })
    } else {
      const added = await db.collection('daily_materials').add({
        data: {
          ...record,
          createdAt: db.serverDate()
        }
      })
      recordId = added._id
    }

    const historyEntry = {
      date: material.date,
      title: material.title || `${material.date} 申论/面试精读`,
      mode: material.mode || 'daily-reading',
      articleTitle: material.dailyArticle && material.dailyArticle.title || '',
      articleUrl: material.dailyArticle && material.dailyArticle.url || '',
      articleColumn: material.dailyArticle && material.dailyArticle.column || '',
      articleCount: material.dailyArticle ? 1 : 0,
      hasCopyText: Boolean(material.copyText),
      updatedAt: db.serverDate()
    }

    const history = await db.collection('history_index')
      .where({ date: material.date })
      .get()

    if (history.data.length > 0) {
      await db.collection('history_index').doc(history.data[0]._id).update({
        data: historyEntry
      })
    } else {
      await db.collection('history_index').add({
        data: {
          ...historyEntry,
          createdAt: db.serverDate()
        }
      })
    }

    return {
      success: true,
      id: recordId,
      date: material.date,
      title: historyEntry.title
    }
  } catch (err) {
    console.error('publishMaterial error:', err)
    return { success: false, error: err.message }
  }
}

function parsePayload(event) {
  if (event && event.body) {
    if (typeof event.body === 'string') {
      try {
        return JSON.parse(event.body)
      } catch (err) {
        throw new Error('HTTP body 不是有效 JSON')
      }
    }
    return event.body
  }
  return event || {}
}

function validateMaterial(material) {
  if (!material || typeof material !== 'object') return '缺少 material'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(material.date || '')) return 'material.date 必须是 YYYY-MM-DD'
  if (!material.copyText || String(material.copyText).length < 50) return 'material.copyText 不能为空'
  if (!String(material.copyText).startsWith('【日期】')) return 'material.copyText 必须从【日期】开始'
  return ''
}
