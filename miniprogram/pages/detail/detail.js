Page({
  data: {
    loading: true,
    date: '',
    source: 'people',
    issueKey: '',
    issueTitle: '',
    article: null,
    currentIndex: 0,
    total: 0,
    hasPrevious: false,
    hasNext: false,
    error: ''
  },

  onLoad(options) {
    this.data.date = options.date || ''
    this.data.source = options.source === 'qiushi' ? 'qiushi' : 'people'
    this.data.issueKey = options.issueKey || ''
    this.fetchArticle(Number(options.index || 0), options.id || '')
  },

  fetchArticle(index, id) {
    this.setData({ loading: true, error: '' })
    wx.cloud.callFunction({
      name: 'getArticleDetail',
      data: {
        source: this.data.source,
        issueKey: this.data.issueKey,
        date: this.data.date,
        index,
        id
      }
    }).then(res => {
      const result = res.result || {}
      if (!result.success || !result.article) {
        this.setData({ loading: false, article: null, error: result.error || '文章读取失败。' })
        return
      }
      this.setData({
        loading: false,
        date: result.date,
        source: result.source || this.data.source,
        issueKey: result.issueKey || this.data.issueKey,
        issueTitle: result.issueTitle || '',
        article: result.article,
        currentIndex: result.index,
        total: result.total,
        hasPrevious: result.hasPrevious,
        hasNext: result.hasNext,
        error: ''
      })
      wx.setNavigationBarTitle({ title: result.issueTitle || `${result.date} 文章` })
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    }).catch(err => {
      this.setData({ loading: false, article: null, error: err.errMsg || '文章读取失败。' })
    })
  },

  onPrevious() {
    if (this.data.hasPrevious) this.fetchArticle(this.data.currentIndex - 1, '')
  },

  onNext() {
    if (this.data.hasNext) this.fetchArticle(this.data.currentIndex + 1, '')
  },

  onCopyUrl() {
    const url = this.data.article && this.data.article.url
    if (!url) return
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) })
  }
})
