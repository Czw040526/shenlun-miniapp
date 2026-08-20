const app = getApp()

Page({
  data: {
    loading: true,
    archive: null,
    articles: [],
    pendingText: '',
    error: ''
  },

  onLoad() {
    this.loadLatest(false)
  },

  onShow() {
    const issueKey = this.getScheduledIssueKey()
    if (!this.data.loading && this.data.archive && this.data.archive.issueKey !== issueKey) this.loadLatest(false)
  },

  loadLatest(force) {
    const date = app.formatDate(new Date())
    this.setData({ loading: true, error: '', pendingText: '' })

    wx.cloud.callFunction({
      name: 'getQiushiIssue',
      data: { date, force: force === true }
    }).then(res => {
      const result = res.result || {}
      const archive = result.data
      if (!result.success || !archive || !Array.isArray(archive.articles) || !archive.articles.length) {
        this.setData({ loading: false, archive: null, articles: [], error: result.error || '本期目录读取失败。' })
        return
      }

      const pendingText = result.pendingIssueKey
        ? `${this.formatIssueKey(result.pendingIssueKey)}官网目录暂未上线，当前显示最近一期。`
        : ''
      this.setData({ loading: false, archive, articles: archive.articles, pendingText, error: '' })
      wx.setStorageSync('qiushiLatestIssue', archive)
      wx.setNavigationBarTitle({ title: `《求是》第${archive.issue}期` })
    }).catch(err => {
      const cached = wx.getStorageSync('qiushiLatestIssue')
      if (cached && Array.isArray(cached.articles) && cached.articles.length) {
        this.setData({ loading: false, archive: cached, articles: cached.articles, error: '' })
        return
      }
      this.setData({ loading: false, archive: null, articles: [], error: err.errMsg || '《求是》目录读取失败。' })
    })
  },

  onRefresh() {
    wx.showToast({ title: '正在更新期刊', icon: 'loading', duration: 1500 })
    this.loadLatest(true)
  },

  onOpenArticle(e) {
    const article = this.data.articles[Number(e.currentTarget.dataset.index || 0)]
    const archive = this.data.archive
    if (!article || !archive) return
    wx.navigateTo({
      url: `/pages/detail/detail?source=qiushi&issueKey=${archive.issueKey}&date=${archive.publishDate}&index=${article.index}&id=${encodeURIComponent(article.id)}`
    })
  },

  getScheduledIssueKey() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const issue = month * 2 - (now.getDate() < 16 ? 1 : 0)
    return `${year}-${String(issue).padStart(2, '0')}`
  },

  formatIssueKey(issueKey) {
    const parts = String(issueKey || '').split('-')
    return parts.length === 2 ? `《求是》${parts[0]}年第${Number(parts[1])}期` : '新一期《求是》'
  }
})
