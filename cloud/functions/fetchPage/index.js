// 云函数：抓取网页内容
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const REQUEST_TIMEOUT = 30000

exports.main = async (event) => {
  const { url } = event

  if (!url) {
    return { success: false, error: '缺少 url 参数' }
  }

  try {
    const https = require('https')
    const http = require('http')

    const html = await new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const req = client.get(url, {
        timeout: REQUEST_TIMEOUT,
        family: 4,
        headers: {
          'User-Agent': 'Mozilla/5.0 shenlun-miniapp-cloud',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href

          const redirectClient = redirectUrl.startsWith('https') ? https : http
          redirectClient.get(redirectUrl, {
            timeout: REQUEST_TIMEOUT,
            family: 4,
            headers: {
              'User-Agent': 'Mozilla/5.0 shenlun-miniapp-cloud',
              'Accept': 'text/html,application/xhtml+xml'
            }
          }, (redirectRes) => {
            let body = ''
            redirectRes.on('data', chunk => body += chunk)
            redirectRes.on('end', () => resolve(body))
          }).on('error', reject)
          return
        }

        let body = ''
        // 人民网页面通常使用 GBK/GB2312 编码，buffer 方式收集
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          // 尝试从 meta 标签检测编码
          const head = buffer.toString('ascii', 0, 1024)
          const charsetMatch = head.match(/charset[=]\s*["']?([a-zA-Z0-9-]+)/i)
          const encoding = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8'

          try {
            if (encoding === 'gbk' || encoding === 'gb2312' || encoding === 'gb18030') {
              const iconv = require('iconv-lite')
              resolve(iconv.decode(buffer, 'gbk'))
            } else {
              resolve(buffer.toString('utf-8'))
            }
          } catch {
            resolve(buffer.toString('utf-8'))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error(`请求超过 ${REQUEST_TIMEOUT / 1000} 秒`)) })
    })

    return { success: true, html, url }
  } catch (err) {
    console.error('fetchPage error:', err)
    return { success: false, error: err.message, html: null }
  }
}
