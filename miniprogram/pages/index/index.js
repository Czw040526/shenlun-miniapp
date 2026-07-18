// 首页逻辑
const app = getApp()
const { buildCopyText, splitCopySections, isUsableCopyText } = require('../../utils/materialFormatter')

Page({
  data: {
    loading: true,
    dateText: '',
    data: null,
    copyText: '',
    error: ''
  },

  onLoad() {
    this.setData({ dateText: this.getStudyDate() })
    this.fetchToday()
  },

  onShow() {
    // 每次回到首页时触发一次刷新（静默）
  },

  // 获取今日素材
  fetchToday() {
    this.setData({ loading: true, error: '' })
    const today = this.getStudyDate()

    wx.cloud.callFunction({
      name: 'getDailyMaterial',
      data: { date: today }
    }).then(res => {
      if (res.result && res.result.data) {
        const material = this.normalizeMaterial(res.result.data)
        this.cacheMaterial(material)
        this.setData({
          data: material,
          copyText: material.copyText || '',
          loading: false,
          error: ''
        })
      } else {
        // 没有当日数据时尝试用本地缓存兜底
        const cached = wx.getStorageSync('todayMaterial')
        if (cached && cached.date === today) {
          const material = this.normalizeMaterial(cached)
          this.setData({
            data: material,
            copyText: material.copyText || '',
            loading: false,
            error: ''
          })
        } else {
          this.setData({
            data: null,
            copyText: '',
            loading: false,
            error: res.result && res.result.error ? res.result.error : ''
          })
        }
      }
    }).catch(() => {
      // 云函数不可用时，用本地缓存兜底
      const cached = wx.getStorageSync('todayMaterial')
      if (cached && cached.date === today) {
        const material = this.normalizeMaterial(cached)
        this.setData({
          data: material,
          copyText: material.copyText || '',
          loading: false,
          error: ''
        })
      } else {
        // 使用本地示例数据
        const sample = wx.getStorageSync('samples_2026-07-16')
        if (sample) {
          const material = this.normalizeMaterial(sample)
          this.setData({
            data: material,
            copyText: material.copyText || '',
            loading: false,
            error: ''
          })
        } else {
          this.setData({
            data: null,
            copyText: '',
            loading: false,
            error: '云端读取失败，请稍后刷新。'
          })
        }
      }
    })
  },

  normalizeMaterial(material) {
    if (!material) return material
    const normalized = {
      ...material,
      tier1: this.normalizeArticles(material.tier1),
      tier2: this.normalizeArticles(material.tier2),
      tier3: this.normalizeArticles(material.tier3),
      highlightQuotes: this.normalizeQuotes(material.highlightQuotes)
    }
    const sourceCopyText = typeof normalized.copyText === 'string' ? normalized.copyText.trim() : ''
    normalized.copyText = isUsableCopyText(sourceCopyText) ? sourceCopyText : buildCopyText({
      ...normalized,
      copyText: ''
    })
    normalized.copySections = splitCopySections(normalized.copyText)
    return normalized
  },

  normalizeArticles(articles) {
    return (articles || []).map(article => ({
      ...article,
      quotes: this.normalizeQuotes(article.quotes)
    }))
  },

  normalizeQuotes(quotes) {
    return (quotes || []).map(item => {
      if (typeof item === 'string') return item
      return item && (item.text || item.quote || item.content || item.scene || item.usage) || ''
    }).filter(Boolean)
  },

  getStudyDate() {
    const today = app.globalData.currentDate
    const parts = today.split('-').map(Number)
    const utc = Date.UTC(parts[0], parts[1] - 1, parts[2])
    const date = new Date(utc - 24 * 60 * 60 * 1000)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  cacheMaterial(material) {
    wx.setStorageSync('todayMaterial', material)
    const articles = [
      material.dailyArticle,
      ...(material.tier1 || []),
      ...(material.tier2 || []),
      ...(material.tier3 || [])
    ].filter(Boolean)
    wx.setStorageSync('todayArticles', articles)
  },

  // 手动刷新
  onRefresh() {
    wx.showLoading({ title: '刷新中…' })
    this.fetchToday()
    setTimeout(() => wx.hideLoading(), 800)
  },

  // 点击文章进详情
  onTapArticle(e) {
    const { id, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&title=${encodeURIComponent(title)}`
    })
  },

  // 复制金句
  onCopyQuote(e) {
    const text = e.currentTarget.dataset.text
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1200 })
      }
    })
  },

  onCopyAll() {
    const text = this.data.copyText || ''
    if (!text) {
      wx.showToast({ title: '暂无可复制内容', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '全文已复制', icon: 'success', duration: 1400 })
      }
    })
  },

  onCopySection(e) {
    const index = Number(e.currentTarget.dataset.index)
    const sections = this.data.data && this.data.data.copySections || []
    const section = sections[index]
    if (!section || !section.text) {
      wx.showToast({ title: '该模块暂无内容', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: section.text,
      success: () => {
        wx.showToast({ title: `${section.label}已复制`, icon: 'success', duration: 1400 })
      }
    })
  },

  onCopySectionUrl(e) {
    const index = Number(e.currentTarget.dataset.index)
    const sections = this.data.data && this.data.data.copySections || []
    const section = sections[index]
    const url = section && section.urls && section.urls[0] && section.urls[0].url
    if (!url) {
      wx.showToast({ title: '文章网址不存在', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '文章网址已复制', icon: 'success', duration: 1400 })
      }
    })
  },

  onCopyArticleUrl(e) {
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const lineIndex = Number(e.currentTarget.dataset.lineIndex)
    const sections = this.data.data && this.data.data.copySections || []
    const line = sections[sectionIndex] && sections[sectionIndex].contentLines[lineIndex]
    if (!line || !line.url) {
      wx.showToast({ title: '文章网址不存在', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: line.url,
      success: () => {
        wx.showToast({ title: '文章网址已复制', icon: 'success', duration: 1400 })
      }
    })
  }
})
