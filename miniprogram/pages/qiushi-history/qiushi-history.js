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
    wx.cloud.callFunction({ name: 'getQiushiHistory', data: { limit: 48 } }).then(res => {
      const result = res.result || {}
      const records = (result.records || []).map(record => ({
        ...record,
        month: record.publishDate ? Number(record.publishDate.slice(5, 7)) : '',
        day: record.publishDate ? record.publishDate.slice(8, 10) : ''
      }))
      this.setData({ loading: false, records, error: result.error || '' })
      wx.setStorageSync('qiushiHistory', records)
    }).catch(err => {
      const records = wx.getStorageSync('qiushiHistory') || []
      this.setData({ loading: false, records, error: err.errMsg || '《求是》历史存档读取失败。' })
    })
  },

  onOpenArticle(e) {
    const issueKey = e.currentTarget.dataset.issueKey
    const date = e.currentTarget.dataset.date
    const index = Number(e.currentTarget.dataset.index || 0)
    const id = e.currentTarget.dataset.id || ''
    wx.navigateTo({
      url: `/pages/detail/detail?source=qiushi&issueKey=${issueKey}&date=${date}&index=${index}&id=${encodeURIComponent(id)}`
    })
  }
})
