App({
  globalData: {
    userInfo: null,
    currentDate: ''
  },
  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      // 部署前替换为自己的腾讯云开发环境 ID
      env: 'your-cloudbase-env-id',
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
