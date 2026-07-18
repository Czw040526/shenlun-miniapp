const assert = require('assert')

const { extractJsonObject } = require('../lib/deepseek-client')

const raw = `这里是结果：
\`\`\`json
{
  "date": "2026-07-16",
  "dailyArticle": {
    "title": "测试文章"
  }
}
\`\`\`
请查收。`

const parsed = extractJsonObject(raw)
assert.strictEqual(parsed.date, '2026-07-16')
assert.strictEqual(parsed.dailyArticle.title, '测试文章')

assert.throws(() => extractJsonObject('没有 JSON'), /未找到 JSON/)

console.log('PASS deepseek-client')
