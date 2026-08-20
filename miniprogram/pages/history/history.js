Page({
  data: {
    loading: true,
    records: [],
    error: ''
  },

  onShow() {
    this.fetchHistory()
  },

  fetchHistory() {
    this.setData({ loading: true, error: '' })
    wx.cloud.callFunction({
      name: 'getHistory',
      data: { limit: 60 }
    }).then(res => {
      const result = res.result || {}
      const records = (result.records || []).map(record => ({
        ...record,
        month: record.date ? Number(record.date.slice(5, 7)) : '',
        day: record.date ? record.date.slice(8, 10) : ''
      }))
      this.setData({ loading: false, records, error: result.error || '' })
      wx.setStorageSync('articleHistory', records)
    }).catch(err => {
      const records = wx.getStorageSync('articleHistory') || []
      this.setData({ loading: false, records, error: err.errMsg || '历史记录读取失败。' })
    })
  },

  onOpenArticle(e) {
    const date = e.currentTarget.dataset.date
    const index = Number(e.currentTarget.dataset.index || 0)
    const id = e.currentTarget.dataset.id || ''
    wx.navigateTo({
      url: `/pages/detail/detail?date=${date}&index=${index}&id=${encodeURIComponent(id)}`
    })
  }
})
