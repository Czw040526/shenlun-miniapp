const assert = require('assert')
const {
  parseArticleLinks,
  parseArticlePage,
  isReadableArticle
} = require('../cloud/functions/getDailyMaterial/article-core')

const listHtml = `
  <a href="/n1/2026/0720/c123-456.html" title="以实干推动高质量发展">文章</a>
  <a href="/n1/2026/0719/c123-455.html">昨日文章</a>
`
const links = parseArticleLinks(listHtml, {
  column: '观点首页',
  priority: 1,
  url: 'http://opinion.people.com.cn/'
})
assert.strictEqual(links.length, 2)
assert.strictEqual(links[0].title, '以实干推动高质量发展')
assert.strictEqual(links[0].url, 'http://opinion.people.com.cn/n1/2026/0720/c123-456.html')

const detailHtml = `
  <html><head><meta name="publishdate" content="2026-07-20"></head><body>
  <h1>以实干推动高质量发展</h1>
  <div>2026年07月20日 来源：人民网 作者：张三</div>
  <div class="rm_txt_con cf">
    <p>这是第一段完整正文，包含足够长度用于验证文章正文解析功能是否正常工作。</p>
    <p>这是第二段完整正文，强调页面应直接呈现文章内容，而不是生成额外讲解。</p>
    <p>这是第三段完整正文，用户可以继续点击下一篇文章，并在历史存档中再次阅读。</p>
  </div>
  <div class="edit">责任编辑：测试</div>
  </body></html>
`
const article = parseArticlePage(detailHtml, links[0], '2026-07-20')
assert.strictEqual(article.title, '以实干推动高质量发展')
assert.strictEqual(article.publishDate, '2026-07-20')
assert.strictEqual(article.paragraphs.length, 3)
assert.ok(article.content.includes('不是生成额外讲解'))
assert.ok(isReadableArticle(article))

console.log('PASS article-reader')
