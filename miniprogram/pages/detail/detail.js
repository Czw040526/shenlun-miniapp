// 详情页逻辑
Page({
  data: {
    loading: true,
    article: null
  },

  onLoad(options) {
    const { id, title } = options
    if (title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(title).substring(0, 12) + '…' })
    }
    this.fetchDetail(id)
  },

  // 获取文章详情
  fetchDetail(id) {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getArticleDetail',
      data: { id }
    }).then(res => {
      if (res.result && res.result.article) {
        this.setData({ article: this.normalizeArticle(res.result.article), loading: false })
      } else {
        this.setData({ article: null, loading: false })
      }
    }).catch(() => {
      // 降级从缓存读取
      const allArticles = wx.getStorageSync('todayArticles') || []
      const article = allArticles.find(a => a.id === id)
      this.setData({ article: this.normalizeArticle(article) || null, loading: false })
    })
  },

  normalizeArticle(article) {
    if (!article) return article
    return {
      ...article,
      quotes: (article.quotes || []).map(item => {
        if (typeof item === 'string') return item
        return item && (item.text || item.quote || item.content || item.scene || item.usage) || ''
      }).filter(Boolean)
    }
  },

  // 复制金句
  onCopy(e) {
    const text = e.currentTarget.dataset.text
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1200 })
      }
    })
  },

  // 打开原文链接
  onOpenUrl() {
    const url = this.data.article.url
    if (url) {
      wx.setClipboardData({
        data: url,
        success: () => {
          wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none', duration: 2000 })
        }
      })
    }
  }
})
