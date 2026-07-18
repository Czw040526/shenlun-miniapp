const https = require('https')

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

function extractJsonObject(text) {
  const source = String(text || '').trim()
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : source
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('未找到 JSON')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

function callDeepSeek(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return Promise.reject(new Error('未配置 DEEPSEEK_API_KEY'))
  }

  const payload = JSON.stringify({
    model: options.model || 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: '你是专业申论教研老师，请严格按用户要求输出。'
      },
      { role: 'user', content: prompt }
    ],
    temperature: options.temperature == null ? 0.45 : options.temperature,
    max_tokens: options.maxTokens || 8192
  })

  const url = new URL(DEEPSEEK_API_URL)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: options.timeout || 60000
    }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'DeepSeek API error'))
            return
          }
          const text = parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : ''
          if (!text) {
            reject(new Error('DeepSeek 未返回内容'))
            return
          }
          resolve({ text, usage: parsed.usage || null })
        } catch (err) {
          reject(new Error(`DeepSeek 响应解析失败：${body.slice(0, 200)}`))
        }
      })
    })

    req.on('timeout', () => req.destroy(new Error('DeepSeek 请求超时')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

module.exports = {
  callDeepSeek,
  extractJsonObject
}
