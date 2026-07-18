// 历史记录页逻辑
const { buildCopyText, splitCopySections, isUsableCopyText } = require('../../utils/materialFormatter')

Page({
  data: {
    loading: true,
    records: []
  },

  onShow() {
    this.fetchHistory()
  },

  // 获取历史记录
  fetchHistory() {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getHistory',
      data: { limit: 60 }
    }).then(res => {
      if (res.result && res.result.records) {
        const records = res.result.records.map(r => this.normalizeRecord(r))
        this.setData({ records, loading: false })
      } else {
        // 降级从缓存读取
        const cached = wx.getStorageSync('historyRecords') || []
        const records = cached.map(r => this.normalizeRecord(r))
        this.setData({ records, loading: false })
      }
    }).catch(() => {
      const cached = wx.getStorageSync('historyRecords') || []
      const records = cached.map(r => this.normalizeRecord(r))
      this.setData({ records, loading: false })
    })
  },

  normalizeRecord(record) {
    const normalized = {
      ...record,
      month: record.date ? parseInt(record.date.split('-')[1]) : '',
      day: record.date ? record.date.split('-')[2] : '',
      highlightQuotes: this.normalizeQuotes(record.highlightQuotes),
      tier1: this.normalizeArticles(record.tier1),
      tier2: this.normalizeArticles(record.tier2),
      tier3: this.normalizeArticles(record.tier3),
      expanded: false
    }
    const sourceCopyText = typeof normalized.copyText === 'string' ? normalized.copyText.trim() : ''
    const usableSource = isUsableCopyText(sourceCopyText)
    const sourceSections = usableSource ? splitCopySections(sourceCopyText) : []
    normalized.needsDetail = !usableSource || !sourceSections.length
    normalized.copyText = usableSource ? sourceCopyText : buildCopyText({
      ...normalized,
      copyText: ''
    })
    normalized.copySections = splitCopySections(normalized.copyText)
    if (!normalized.copyText || !normalized.copySections.length) {
      normalized.copyText = buildCopyText({ ...normalized, copyText: '' })
      normalized.copySections = splitCopySections(normalized.copyText)
    }
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

  // 展开/收起
  onToggle(e) {
    const { index } = e.currentTarget.dataset
    const record = this.data.records[index]
    const expanding = !record.expanded
    const key = `records[${index}].expanded`
    this.setData({ [key]: expanding })
    if (expanding && (record.needsDetail || !record.copySections || !record.copySections.length)) {
      this.fetchRecordDetail(index, record.date)
    }
  },

  fetchRecordDetail(index, date) {
    const loadingKey = `records[${index}].detailLoading`
    this.setData({ [loadingKey]: true })
    wx.cloud.callFunction({
      name: 'getDailyMaterial',
      data: { date }
    }).then(res => {
      const detail = res.result && res.result.data
      if (!detail) return
      const current = this.data.records[index] || {}
      const normalized = this.normalizeRecord({ ...current, ...detail })
      normalized.expanded = true
      normalized.detailLoading = false
      this.setData({ [`records[${index}]`]: normalized })
    }).catch(() => {
      wx.showToast({ title: '历史素材加载失败', icon: 'none' })
    }).then(() => {
      this.setData({ [loadingKey]: false })
    })
  },

  // 点击文章
  onTapArticle(e) {
    const { id, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&title=${encodeURIComponent(title)}`
    })
  },

  onCopyRecord(e) {
    const text = e.currentTarget.dataset.text || ''
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
    const recordIndex = Number(e.currentTarget.dataset.recordIndex)
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const record = this.data.records[recordIndex]
    const section = record && record.copySections && record.copySections[sectionIndex]
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
    const recordIndex = Number(e.currentTarget.dataset.recordIndex)
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const record = this.data.records[recordIndex]
    const section = record && record.copySections && record.copySections[sectionIndex]
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
    const recordIndex = Number(e.currentTarget.dataset.recordIndex)
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex)
    const lineIndex = Number(e.currentTarget.dataset.lineIndex)
    const record = this.data.records[recordIndex]
    const section = record && record.copySections && record.copySections[sectionIndex]
    const line = section && section.contentLines && section.contentLines[lineIndex]
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
