const assert = require('assert')
const {
  issueScheduleForDate,
  findAnnualUrl,
  parseAnnualIssues,
  parseIssueArticleLinks,
  parseQiushiArticlePage
} = require('../cloud/functions/getQiushiIssue/qiushi-core')
const { parseQiushiArticlePage: parseDetailArticlePage } = require('../cloud/functions/getArticleDetail/qiushi-core')

assert.deepStrictEqual(issueScheduleForDate('2026-08-01'), {
  year: 2026,
  issue: 15,
  issueKey: '2026-15',
  publishDate: '2026-08-01',
  title: '《求是》2026年第15期'
})
assert.strictEqual(issueScheduleForDate('2026-08-15').issue, 15)
assert.strictEqual(issueScheduleForDate('2026-08-16').issue, 16)
assert.strictEqual(issueScheduleForDate('2026-12-31').issue, 24)

const catalogHtml = '<a href="/20251231/year/c.html">《求是》2026年</a>'
assert.strictEqual(
  findAnnualUrl(catalogHtml, 2026, 'https://www.qstheory.cn/qs/mulu.htm'),
  'https://www.qstheory.cn/20251231/year/c.html'
)

const annualHtml = [
  '<a href="/20260715/issue14/c.html">《求是》2026年第14期</a>',
  '<a href="/20260731/issue15/c.html">《求是》2026年第15期</a>'
].join('')
const issues = parseAnnualIssues(annualHtml, 2026, 'https://www.qstheory.cn/20251231/year/c.html')
assert.strictEqual(issues.length, 2)
assert.strictEqual(issues[1].issueKey, '2026-15')
assert.strictEqual(issues[1].publishDate, '2026-08-01')

const issueInfo = issues[1]
const directoryHtml = `
  <div id="detailContent">
    <p><a href="https://www.qstheory.cn/20260731/aaaa/c.html"><strong>本期导读</strong></a></p>
    <p><a href="https://www.qstheory.cn/20260731/bbbb/c.html">推动高质量发展</a> /习近平</p>
    <p><a href="https://www.qstheory.cn/20260731/cccc/c.html">体系化研究│主标题</a><br><a href="https://www.qstheory.cn/20260731/cccc/c.html">——副标题</a> /本刊编辑部</p>
    <p><a href="https://www.qstheory.cn/20251231/year/c.html">《求是》2026年</a></p>
  </div><div class="xl_ewm"></div>`
const articles = parseIssueArticleLinks(directoryHtml, issueInfo.directoryUrl, issueInfo)
assert.strictEqual(articles.length, 3)
assert.strictEqual(articles[1].author, '习近平')
assert.strictEqual(articles[2].title, '体系化研究│主标题——副标题')

const articleHtml = `
  <h1>推动高质量发展</h1>
  <h2>来源：《求是》2026/15 作者：习近平 2026-08-01 09:00:00</h2>
  <div id="detailContent">
    <p>第一段正文内容，阐明发展的重要意义和实践要求。</p>
    <p>第二段正文内容，提出具体路径和长效机制。</p>
  </div><div class="xl_ewm"></div>`
const article = parseQiushiArticlePage(articleHtml, articles[1])
assert.strictEqual(article.title, '推动高质量发展')
assert.strictEqual(article.author, '习近平')
assert.strictEqual(article.source, '《求是》2026/15')
assert.strictEqual(article.paragraphs.length, 2)
assert.deepStrictEqual(parseDetailArticlePage(articleHtml, articles[1]), article)

console.log('PASS qiushi-reader')
