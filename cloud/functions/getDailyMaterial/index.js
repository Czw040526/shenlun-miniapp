// 云函数：获取当日素材
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const date = event.date || getTodayString()

  try {
    // 从数据库查询
    const res = await db.collection('daily_materials')
      .where({ date })
      .get()

    if (res.data.length > 0) {
      return { success: true, data: res.data[0].material }
    }

    return {
      success: false,
      pending: true,
      error: `${date} 的素材尚未生成完成。云函数会在每天 7:30 后按批次处理前一天内容，请稍后刷新。`,
      data: null
    }
  } catch (err) {
    console.error('getDailyMaterial error:', err)
    return { success: false, error: err.message, data: null }
  }
}

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
