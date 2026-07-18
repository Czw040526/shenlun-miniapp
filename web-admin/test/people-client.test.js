const assert = require('assert')

const {
  normalizePeopleUrl,
  parseArticleLinks,
  filterArticlesByDate
} = require('../lib/people-client')

const html = `
<html>
  <body>
    <a href="/n1/2026/0716/c436867-40762179.html" title="物业信息小账本连着城市基层大治理">物业信息小账本连着城市基层大治理</a>
    <a href="http://opinion.people.com.cn/n1/2026/0716/c436867-40761848.html">极端天气下防汛救灾，需要全社会认知升维</a>
    <a href="/n1/2026/0715/c436867-40760000.html" title="旧日期文章">旧日期文章</a>
    <a href="http://world.people.com.cn/n1/2026/0716/c1002-40760001.html" title="非观点频道">非观点频道</a>
  </body>
</html>
`

assert.strictEqual(
  normalizePeopleUrl('/n1/2026/0716/c436867-40762179.html', 'http://opinion.people.com.cn/GB/223228/index.html'),
  'http://opinion.people.com.cn/n1/2026/0716/c436867-40762179.html'
)

const links = parseArticleLinks(html, {
  column: '人民锐评',
  priority: 1,
  url: 'http://opinion.people.com.cn/GB/223228/index.html'
})

assert.strictEqual(links.length, 3)
assert.strictEqual(links[0].title, '物业信息小账本连着城市基层大治理')
assert.strictEqual(links[0].column, '人民锐评')
assert.strictEqual(links[0].priority, 1)

const filtered = filterArticlesByDate(links, '2026-07-16')
assert.strictEqual(filtered.length, 2)
assert(filtered.every(item => item.url.includes('/2026/0716/')))

console.log('PASS people-client')
