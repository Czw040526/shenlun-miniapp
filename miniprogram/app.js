App({
  globalData: {
    baseUrl: 'https://your-api-domain.com',
    userInfo: null,
    currentDate: ''
  },
  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      env: 'cloud1-d0g7x4oyh222f603a',
      traceUser: true
    })

    // 获取当前日期作为默认日期
    const now = new Date()
    this.globalData.currentDate = this.formatDate(now)
  },
  formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
