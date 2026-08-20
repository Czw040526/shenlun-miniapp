const app = getApp()

Page({
  data: {
    loading: true,
    dateText: '',
    archive: null,
    article: null,
    currentIndex: 0,
    total: 0,
    hasPrevious: false,
    hasNext: false,
    error: ''
  },

  onLoad() {
    this.loadToday(false)
  },

  onShow() {
    const today = this.getToday()
    if (this.data.dateText && this.data.dateText !== today) this.loadToday(false)
  },

  loadToday(force) {
    const date = this.getToday()
    const previousId = this.data.article && this.data.article.id
    this.setData({ loading: true, dateText: date, error: '' })

    wx.cloud.callFunction({
      name: 'getDailyMaterial',
      data: { date, force: force === true }
    }).then(res => {
      const result = res.result || {}
      const archive = result.data
      const articles = archive && Array.isArray(archive.articles) ? archive.articles : []
      if (!result.success || !articles.length) {
        this.setData({
          loading: false,
          archive: null,
          article: null,
          total: 0,
          error: result.error || '今天暂时没有可读文章。'
        })
        return
      }

      let index = previousId ? articles.findIndex(article => article.id === previousId) : 0
      if (index < 0) index = 0
      this.setArchive(archive, index)
      wx.setStorageSync(`articleArchive:${date}`, archive)
    }).catch(err => {
      const cached = wx.getStorageSync(`articleArchive:${date}`)
      if (cached && Array.isArray(cached.articles) && cached.articles.length) {
        this.setArchive(cached, 0)
        return
      }
      this.setData({
        loading: false,
        archive: null,
        article: null,
        total: 0,
        error: err && err.errMsg ? err.errMsg : '云端读取失败，请稍后刷新。'
      })
    })
  },

  setArchive(archive, index) {
    const articles = archive.articles || []
    const safeIndex = Math.min(Math.max(Number(index || 0), 0), Math.max(articles.length - 1, 0))
    const article = articles[safeIndex] || null
    this.setData({
      loading: false,
      archive,
      article,
      dateText: archive.date,
      currentIndex: safeIndex,
      total: articles.length,
      hasPrevious: safeIndex > 0,
      hasNext: safeIndex < articles.length - 1,
      error: ''
    })
    if (article && article.title) {
      wx.setNavigationBarTitle({ title: '人民网文章' })
    }
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  onPrevious() {
    if (!this.data.hasPrevious) return
    this.setArchive(this.data.archive, this.data.currentIndex - 1)
  },

  onNext() {
    if (!this.data.hasNext) return
    this.setArchive(this.data.archive, this.data.currentIndex + 1)
  },

  onRefresh() {
    wx.showToast({ title: '正在更新文章', icon: 'loading', duration: 1500 })
    this.loadToday(true)
  },

  onCopyUrl() {
    const url = this.data.article && this.data.article.url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'success' })
    })
  },

  getToday() {
    const date = app.formatDate(new Date())
    app.globalData.currentDate = date
    return date
  }
})
