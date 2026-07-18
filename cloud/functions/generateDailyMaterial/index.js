// 云函数：分批生成每日申论/面试素材
const cloud = require('wx-server-sdk')
const {
  MODULE_KEYS,
  asArray,
  cleanText,
  getPreviousDate,
  getTodayChinaDate,
  formatChineseDate,
  buildPublishMaterial,
  buildModuleDraft,
  mergeModuleDrafts,
  summarizeFinalDraft,
  validateModuleDraft,
  validateMaterial
} = require('./material-core')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const JOB_COLLECTION = 'material_generation_jobs'
const MATERIAL_COLLECTION = 'daily_materials'
const HISTORY_COLLECTION = 'history_index'
const MAX_ARTICLES = 12
const LIMIT_PER_COLUMN = 4
const DEFAULT_BATCH_SIZE = 1
const ARTICLE_TEXT_LIMIT = 6500

const COLUMN_URLS = [
  { column: '人民锐评', priority: 1, url: 'http://opinion.people.com.cn/GB/223228/index.html' },
  { column: '人民时评', priority: 1, url: 'http://opinion.people.com.cn/GB/40604/index.html' },
  { column: '今日谈', priority: 1, url: 'http://opinion.people.com.cn/GB/51854/index.html' },
  { column: '人民论坛', priority: 2, url: 'http://opinion.people.com.cn/GB/41166/index.html' },
  { column: '金台随笔', priority: 2, url: 'http://opinion.people.com.cn/GB/41167/index.html' },
  { column: '治理之道', priority: 3, url: 'http://opinion.people.com.cn/GB/41168/index.html' },
  { column: '壹时评', priority: 3, url: 'http://opinion.people.com.cn/GB/8213/420650/index.html' }
]

exports.main = async (event = {}) => {
  const action = normalizeAction(event)
  const targetDate = event.date || getPreviousDate(getTodayChinaDate())

  try {
    await ensureCollections()

    if (action === 'status') {
      return getStatus(targetDate)
    }

    if (action === 'start') {
      return startJobAndWork(targetDate, event)
    }

    if (action === 'work') {
      return workNextJob(event)
    }

    if (action === 'finalize') {
      return finalizeJobByDate(targetDate)
    }

    return autoRun(targetDate, event)
  } catch (err) {
    console.error('generateDailyMaterial error:', err)
    return { success: false, error: err.message }
  }
}

function normalizeAction(event) {
  const action = String(event.action || event.stage || '').toLowerCase()
  if (['start', 'work', 'status', 'finalize'].includes(action)) return action
  return 'auto'
}

async function autoRun(targetDate, event) {
  const activeJob = await findActiveJob()
  if (activeJob) {
    return workJob(activeJob, event)
  }

  const existing = await findMaterial(targetDate)
  if (existing && !event.force) {
    return {
      success: true,
      cached: true,
      status: 'done',
      date: targetDate,
      data: existing.material
    }
  }

  if (event.force || event.date || shouldAutoStartNow()) {
    return startJobAndWork(targetDate, event)
  }

  return {
    success: true,
    idle: true,
    status: 'idle',
    date: targetDate,
    message: '未到自动生成时间，或今日任务已完成。'
  }
}

async function startJobAndWork(targetDate, event) {
  const existing = await findMaterial(targetDate)
  if (existing && !event.force) {
    return {
      success: true,
      cached: true,
      status: 'done',
      date: targetDate,
      data: existing.material
    }
  }

  const active = await findJobByDate(targetDate, ['processing', 'summarizing', 'assembling', 'finalizing'])
  if (active && !event.force) {
    return workJob(active, event)
  }

  const articles = await collectArticles(targetDate)
  const job = await upsertJob(targetDate, {
    status: 'processing',
    cursor: 0,
    articles,
    articleSummaries: [],
    moduleCursor: 0,
    moduleDrafts: {},
    moduleValidations: {},
    errors: [],
    errorMessage: '',
    validationErrors: [],
    startedAt: db.serverDate(),
    updatedAt: db.serverDate(),
    source: 'cloud-batch',
    batchSize: Number(event.batchSize || DEFAULT_BATCH_SIZE)
  })

  if (event.onlyStart) {
    return {
      success: true,
      status: 'processing',
      date: targetDate,
      jobId: job._id,
      total: articles.length
    }
  }

  return workJob(job, event)
}

async function workNextJob(event) {
  const job = event.jobId ? await getJobById(event.jobId) : await findActiveJob()
  if (!job) {
    return {
      success: true,
      idle: true,
      status: 'idle',
      message: '没有待处理的生成任务。'
    }
  }
  return workJob(job, event)
}

async function workJob(job, event = {}) {
  if (job.status === 'finalizing') {
    return finalizeJob(job)
  }
  if (job.status === 'assembling') return workNextModule(job)
  if (job.status === 'summarizing') {
    await updateJob(job._id, {
      status: 'assembling',
      moduleCursor: Number(job.moduleCursor || 0),
      moduleDrafts: job.moduleDrafts || {},
      moduleValidations: job.moduleValidations || {},
      updatedAt: db.serverDate()
    })
    return workNextModule({
      ...job,
      status: 'assembling',
      moduleCursor: Number(job.moduleCursor || 0),
      moduleDrafts: job.moduleDrafts || {},
      moduleValidations: job.moduleValidations || {}
    })
  }

  const articles = asArray(job.articles)
  const cursor = Number(job.cursor || 0)
  if (cursor >= articles.length) {
    await updateJob(job._id, {
      status: 'assembling',
      moduleCursor: Number(job.moduleCursor || 0),
      moduleDrafts: job.moduleDrafts || {},
      moduleValidations: job.moduleValidations || {},
      updatedAt: db.serverDate()
    })
    return {
      success: true,
      status: 'assembling',
      date: job.date,
      jobId: job._id,
      moduleCursor: Number(job.moduleCursor || 0),
      moduleTotal: MODULE_KEYS.length,
      next: '单篇分析完成，等待逐模块生成。'
    }
  }

  const requestedBatchSize = Number(event.batchSize || job.batchSize || DEFAULT_BATCH_SIZE)
  const batchSize = Math.max(1, Math.min(requestedBatchSize, 2))
  const end = Math.min(cursor + batchSize, articles.length)
  const articleSummaries = asArray(job.articleSummaries)
  const errors = asArray(job.errors)

  for (let index = cursor; index < end; index += 1) {
    const article = articles[index]
    try {
      const detail = await fetchArticleDetail(article, job.date)
      const urlDate = extractDateFromPeopleUrl(article.url)
      if (urlDate !== job.date || detail.publishDate !== job.date) {
        throw new Error(`文章时效校验失败：链接日期${urlDate || '未知'}，页面日期${detail.publishDate || '未知'}，目标日期${job.date}`)
      }
      const articleWithDate = {
        ...article,
        publishDate: detail.publishDate,
        originalDate: detail.publishDate
      }
      articles[index] = articleWithDate
      const summary = await analyzeArticle(articleWithDate, detail.text, job.date)
      articleSummaries.push(summary)
    } catch (err) {
      console.error('article processing failed:', article && article.title, err)
      errors.push({
        title: article && article.title,
        url: article && article.url,
        message: err.message,
        at: new Date().toISOString()
      })
      articleSummaries.push(makeFallbackArticleSummary(article, err.message))
    }
  }

  const nextStatus = end >= articles.length ? 'assembling' : 'processing'
  await updateJob(job._id, {
    status: nextStatus,
    cursor: end,
    articles,
    articleSummaries,
    errors,
    updatedAt: db.serverDate()
  })

  return {
    success: true,
    status: nextStatus,
    date: job.date,
    jobId: job._id,
    cursor: end,
    total: articles.length,
    moduleCursor: Number(job.moduleCursor || 0),
    moduleTotal: MODULE_KEYS.length,
    next: nextStatus === 'assembling'
      ? '单篇分析完成，等待逐模块生成。'
      : '等待下一次定时触发继续处理。'
  }
}

async function workNextModule(job) {
  const latest = job._id ? await getJobById(job._id) : job
  const current = latest || job
  const moduleCursor = Number(current.moduleCursor || 0)

  if (moduleCursor >= MODULE_KEYS.length) {
    await updateJob(current._id, { status: 'finalizing', updatedAt: db.serverDate() })
    return {
      success: true,
      status: 'finalizing',
      date: current.date,
      jobId: current._id,
      next: '精读模块均已校验，等待最终合并。'
    }
  }

  const moduleKey = MODULE_KEYS[moduleCursor]
  const moduleDrafts = { ...(current.moduleDrafts || {}) }
  const moduleValidations = { ...(current.moduleValidations || {}) }
  const moduleDraft = buildModuleDraft(
    moduleKey,
    asArray(current.articleSummaries),
    current.date,
    asArray(current.articles)
  )
  const validation = validateModuleDraft(
    moduleKey,
    moduleDraft,
    current.date,
    asArray(current.articles),
    moduleDrafts
  )

  moduleValidations[moduleKey] = {
    valid: validation.valid,
    errors: validation.errors,
    checkedAt: new Date().toISOString()
  }

  if (!validation.valid) {
    const errorMessage = `${moduleKey} 模块校验失败：${validation.errors.join('；')}`
    await updateJob(current._id, {
      status: 'failed',
      failedModule: moduleKey,
      errorMessage,
      moduleValidations,
      updatedAt: db.serverDate()
    })
    return {
      success: false,
      status: 'failed',
      date: current.date,
      jobId: current._id,
      module: moduleKey,
      errors: validation.errors
    }
  }

  moduleDrafts[moduleKey] = moduleDraft
  const nextCursor = moduleCursor + 1
  const nextStatus = nextCursor >= MODULE_KEYS.length ? 'finalizing' : 'assembling'
  await updateJob(current._id, {
    status: nextStatus,
    moduleCursor: nextCursor,
    moduleDrafts,
    moduleValidations,
    updatedAt: db.serverDate()
  })

  return {
    success: true,
    status: nextStatus,
    date: current.date,
    jobId: current._id,
    module: moduleKey,
    moduleCursor: nextCursor,
    moduleTotal: MODULE_KEYS.length,
    validation: moduleValidations[moduleKey],
    next: nextStatus === 'finalizing'
      ? '精读模块均已校验，等待最终合并。'
      : `等待生成下一个模块：${MODULE_KEYS[nextCursor]}`
  }
}

async function finalizeJobByDate(targetDate) {
  const job = await findJobByDate(targetDate, ['processing', 'summarizing', 'assembling', 'finalizing', 'failed'])
  if (!job) {
    return { success: false, error: `${targetDate} 没有可收尾的生成任务。` }
  }
  return finalizeJob(job)
}

async function finalizeJob(job) {
  const latest = job._id ? await getJobById(job._id) : job
  const current = latest || job
  const hasAllModules = MODULE_KEYS.every(key => current.moduleDrafts && current.moduleDrafts[key])
  const draft = hasAllModules
    ? mergeModuleDrafts(current.moduleDrafts, current.date)
    : summarizeFinalDraft(asArray(current.articleSummaries), current.date, current.articles)

  const material = buildPublishMaterial({
    ...draft,
    date: current.date,
    sourceDateLabel: formatChineseDate(current.date),
    generatedBy: 'cloud-batch'
  })

  const validation = validateMaterial(material, current.date, current.articles)
  if (!validation.valid) {
    const errorMessage = validation.errors.join('；')
    console.error('素材质量校验失败，已阻止保存：', errorMessage)
    await updateJob(current._id, {
      status: 'failed',
      errorMessage,
      validationErrors: validation.errors,
      updatedAt: db.serverDate()
    })
    return {
      success: false,
      status: 'failed',
      date: current.date,
      jobId: current._id,
      errors: validation.errors
    }
  }

  await saveMaterial(material, asArray(current.articles))
  await updateJob(current._id, {
    status: 'done',
    materialTitle: material.title,
    materialDate: material.date,
    finishedAt: db.serverDate(),
    updatedAt: db.serverDate()
  })

  return {
    success: true,
    status: 'done',
    date: current.date,
    jobId: current._id,
    title: material.title,
    copyTextLength: material.copyText.length
  }
}

async function collectArticles(targetDate) {
  const all = []
  const seen = new Set()
  const seenTitles = new Set()

  for (const column of COLUMN_URLS) {
    try {
      const res = await cloud.callFunction({
        name: 'fetchPage',
        data: { url: column.url }
      })
      const html = res.result && res.result.html ? res.result.html : ''
      const parsed = parseArticleLinks(html, column)
      const sameDay = filterArticlesByDate(parsed, targetDate)
      const selected = sameDay.slice(0, LIMIT_PER_COLUMN)

      selected.forEach(article => {
        const urlKey = normalizeArticleIdentity(article.url)
        const titleKey = normalizeArticleIdentity(article.title)
        if (!urlKey || !titleKey || seen.has(urlKey) || seenTitles.has(titleKey)) return
        seen.add(urlKey)
        seenTitles.add(titleKey)
        all.push({
          ...article,
          matchedDate: true,
          publishDate: targetDate,
          originalDate: targetDate
        })
      })
    } catch (err) {
      console.warn(`抓取 ${column.column} 失败:`, err.message)
    }
  }

  return all
    .sort((a, b) => (a.priority || 9) - (b.priority || 9))
    .slice(0, MAX_ARTICLES)
}

function parseArticleLinks(html, columnInfo) {
  const source = String(html || '')
  const articles = []
  const seen = new Set()
  const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match

  while ((match = linkRegex.exec(source)) !== null) {
    const attrs = match[1] || ''
    const inner = match[2] || ''
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue

    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)
    const title = stripTags(titleMatch ? titleMatch[1] : inner)
    const url = normalizePeopleUrl(hrefMatch[1], columnInfo.url)
    if (!title || title.length < 4) continue
    if (!url.includes('opinion.people.com.cn') || !url.includes('/n1/')) continue
    if (seen.has(url)) continue

    seen.add(url)
    articles.push({
      id: encodeURIComponent(url),
      column: columnInfo.column,
      priority: columnInfo.priority,
      title,
      url
    })
  }

  return articles
}

function filterArticlesByDate(articles, targetDate) {
  return articles.filter(item => extractDateFromPeopleUrl(item && item.url) === targetDate)
}

function extractDateFromPeopleUrl(url) {
  const match = String(url || '').match(/\/n1\/(\d{4})\/(\d{2})(\d{2})\//)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function normalizeArticleIdentity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/[\s“”‘’《》【】（）()：:，,。.!！?？\-_/]/g, '')
}

function normalizePeopleUrl(href, baseUrl) {
  if (!href) return ''
  const clean = decodeHtml(href).trim()
  if (/^https?:\/\//i.test(clean)) return clean
  try {
    return new URL(clean, baseUrl || 'http://opinion.people.com.cn/').toString()
  } catch (err) {
    return ''
  }
}

async function fetchArticleDetail(article, targetDate) {
  if (!article || !article.url || article.error) {
    return { text: '', publishDate: targetDate }
  }

  const res = await cloud.callFunction({
    name: 'fetchPage',
    data: { url: article.url }
  })
  const html = res.result && res.result.html ? res.result.html : ''
  return {
    text: parseArticleText(html),
    publishDate: extractPublishDate(html, article.url, targetDate)
  }
}

function extractPublishDate(html, url, fallbackDate) {
  const source = String(html || '')
  const metaTags = source.match(/<meta\b[^>]*>/gi) || []

  for (const tag of metaTags) {
    const marker = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)
    if (!marker || !content) continue
    if (!/^(article:published_time|publishdate|pubdate)$/i.test(marker[1])) continue
    const date = normalizePublishDate(content[1])
    if (date) return date
  }

  const timeTags = source.match(/<span\b[^>]*class\s*=\s*["'][^"']*(?:date|time)[^"']*["'][^>]*>[\s\S]*?<\/span>/gi) || []
  for (const tag of timeTags) {
    const date = normalizePublishDate(stripTags(tag))
    if (date) return date
  }

  const pageText = stripTags(source)
  const visibleMatch = pageText.match(/(20\d{2}[-年\/.]\d{1,2}[-月\/.]\d{1,2}日?)(?=.{0,40}(?:来源|人民网))/)
  const visibleDate = visibleMatch ? normalizePublishDate(visibleMatch[1]) : ''
  if (visibleDate) return visibleDate

  const urlMatch = String(url || '').match(/\/(\d{4})\/(\d{2})(\d{2})\//)
  if (urlMatch) {
    const urlDate = `${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}`
    if (!Number.isNaN(Date.parse(`${urlDate}T00:00:00Z`))) return urlDate
  }

  return fallbackDate
}

function normalizePublishDate(value) {
  const source = String(value || '')
  const match = source.match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})日?/)
  if (!match) return ''
  const month = String(Number(match[2])).padStart(2, '0')
  const day = String(Number(match[3])).padStart(2, '0')
  const date = `${match[1]}-${month}-${day}`
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? '' : date
}

function parseArticleText(html) {
  const source = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  const contentMatch = source.match(/<div[^>]+class=["'][^"']*(rm_txt_con|artDet|show_text|text|content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  const body = contentMatch ? contentMatch[2] : source
  const paragraphs = []
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let match

  while ((match = pRegex.exec(body)) !== null) {
    const text = stripTags(match[1])
    if (text && text.length > 8) paragraphs.push(text)
  }

  const text = paragraphs.length ? paragraphs.join('\n') : stripTags(body)
  return text.slice(0, ARTICLE_TEXT_LIMIT)
}

async function analyzeArticle(article, text, targetDate) {
  const articleContent = buildArticlePrompt(article, text, targetDate)
  const response = await cloud.callFunction({
    name: 'callDeepSeek',
    data: {
      articleContent,
      maxTokens: 2200,
      temperature: 0.2
    }
  })

  if (!response.result || !response.result.success) {
    throw new Error(response.result && response.result.error ? response.result.error : 'DeepSeek 单篇分析失败')
  }

  const parsed = extractJsonObject(response.result.text)
  return normalizeArticleSummary(parsed, article)
}

function buildArticlePrompt(article, text, targetDate) {
  return `目标日期：${targetDate}
文章实际发布日期：${article.publishDate || targetDate}
栏目：${article.column}
文章原标题：${article.title}
原文链接：${article.url}

文章正文：
${text || '正文抓取失败。不得虚构原文金句，请根据标题做保守分析。'}`
}

function normalizeArticleSummary(summary, article) {
  const source = summary || {}
  const structure = source.structure || {}
  const detail = source.countermeasuresDetail || {}
  const standardWords = source.standardWords || {}
  const goldenSentence = source.goldenSentence || {}
  const caseMaterial = source.caseMaterial || {}
  const goldenText = cleanText(goldenSentence.sentence, '')
  const goldenScene = cleanText(goldenSentence.scenario, '')
  const microMeasures = splitMeasures(structure.countermeasures, detail.content)
  const applicableQuestions = getApplicableQuestions(article.priority)
  const fallbackCandidate = cleanText(detail.content || structure.countermeasures, '')

  return {
    id: article.id || encodeURIComponent(article.url || article.title),
    priority: Number(article.priority || 1),
    column: cleanText(article.column, '人民网观点'),
    title: cleanText(article.title, '未命名文章'),
    url: cleanText(article.url, ''),
    originalDate: cleanText(article.publishDate || article.originalDate, ''),
    publishDate: cleanText(article.publishDate || article.originalDate, ''),
    mainTopic: cleanText(source.mainTopic, ''),
    applicableQuestions,
    structure: {
      intro: cleanText(structure.intro, '由现实问题或政策背景引入，提出核心论点。'),
      analysis: cleanText(structure.analysis, '从问题根源、现实影响或价值意义展开剖析。'),
      measure: cleanText(structure.countermeasures, '围绕问题短板提出针对性举措。'),
      elevation: cleanText(structure.conclusion, '结合时代背景和公共价值进行升华。')
    },
    logicChain: asArray(source.logicChain)
      .map(item => cleanText(item, ''))
      .filter(Boolean)
      .slice(0, 5),
    countermeasure: {
      subject: cleanText(detail.subject, '党委政府、职能部门、社会力量'),
      method: cleanText(detail.means, '制度规范、技术赋能、宣传引导'),
      content: cleanText(detail.content, '开展专项行动，建立长效机制'),
      purpose: cleanText(detail.purpose, '解决现实问题，提升治理效能')
    },
    formalWords: [{
      plain: cleanText(standardWords.original, '原文表述待提取'),
      formal: cleanText(standardWords.standard, '规范表达待完善')
    }],
    highFrequencyPhrases: asArray(source.highFrequencyPhrases || source.phrases)
      .map(item => cleanText(item, ''))
      .filter(Boolean)
      .slice(0, 3),
    quotes: [{
      text: goldenText || '无',
      usage: goldenText ? (goldenScene || '申论/面试答题') : '无'
    }],
    caseMaterials: [{
      fact: cleanText(caseMaterial.fact, ''),
      usage: cleanText(caseMaterial.usage, cleanText(source.mainTopic, '申论/面试举例论证'))
    }].filter(item => item.fact),
    corePoint: cleanText(structure.analysis || source.mainTopic, '围绕中心议题展开论证。'),
    themes: source.mainTopic ? [cleanText(source.mainTopic, '')] : [],
    quote: goldenText || cleanText(structure.conclusion, '无'),
    macroDirection: cleanText(detail.purpose || structure.conclusion, '完善制度机制，加强协同治理'),
    microMeasures,
    topCandidate: {
      text: goldenText || fallbackCandidate,
      scene: goldenText ? (goldenScene || '申论/面试答题') : cleanText(source.mainTopic, '对策题')
    }
  }
}

function getApplicableQuestions(priority) {
  if (Number(priority) === 2) return ['分析题', '大作文（分论点/结尾）']
  if (Number(priority) === 3) return ['对策题', '大作文（分论点/结尾）']
  return ['概括题', '分析题', '对策题', '大作文（分论点/结尾）']
}

function splitMeasures(countermeasures, content) {
  const values = `${cleanText(countermeasures, '')}；${cleanText(content, '')}`
    .split(/[；;。]/)
    .map(item => item.trim())
    .filter(Boolean)
  return [...new Set(values)].slice(0, 3)
}

function makeFallbackArticleSummary(article, reason) {
  const item = article || {}
  return {
    id: item.id || encodeURIComponent(item.url || item.title || 'article'),
    priority: item.priority || 1,
    column: item.column || '人民网观点',
    title: item.title || '未命名文章',
    url: item.url || '',
    applicableQuestions: ['概括题', '分析题'],
    structure: {
      intro: '由文章标题所涉现象引入，提出治理或发展议题。',
      analysis: '从现实需求、问题短板或价值意义展开分析。',
      measure: '围绕制度完善、协同推进、精准落实提出对策。',
      elevation: '结合高质量发展和治理现代化背景进行升华。'
    },
    logicChain: ['切现实议题', '找问题症结', '明主体责任', '建长效机制', '升治理效能'],
    countermeasure: {
      subject: '党委政府、职能部门、社会力量',
      method: '制度规范、数字赋能、宣传引导、监督反馈',
      content: '开展专项治理，建立长效机制',
      purpose: '解决现实问题，提升治理效能'
    },
    formalWords: [
      { plain: '大家一起去想办法', formal: '凝聚共识，形成合力 / 多元共治' }
    ],
    highFrequencyPhrases: ['问题导向', '多元共治', '闭环治理'],
    quotes: [
      { text: '把问题导向贯穿治理全过程，把群众需求落到行动细节中。', usage: '基层治理/对策题' }
    ],
    caseMaterials: [
      { fact: `以《${item.title || '今日文章'}》所涉议题为例，说明治理要坚持问题导向和效果导向。`, usage: '举例论证' }
    ],
    corePoint: '只有坚持问题导向，才能提升治理实效。',
    themes: ['治理', '民生'],
    quote: '把问题导向贯穿治理全过程，把群众需求落到行动细节中。',
    macroDirection: '完善制度机制，加强协同治理',
    microMeasures: ['明确责任清单', '建立协同机制', '完善反馈闭环'],
    topCandidate: {
      text: '把问题导向贯穿治理全过程，把群众需求落到行动细节中。',
      scene: '基层治理/对策题'
    },
    error: reason || ''
  }
}

async function saveMaterial(material, articles) {
  const record = {
    date: material.date,
    material,
    articles,
    source: 'cloud-batch',
    updatedAt: db.serverDate()
  }

  const existing = await db.collection(MATERIAL_COLLECTION)
    .where({ date: material.date })
    .limit(1)
    .get()

  if (existing.data.length > 0) {
    await db.collection(MATERIAL_COLLECTION).doc(existing.data[0]._id).update({
      data: record
    })
  } else {
    await db.collection(MATERIAL_COLLECTION).add({
      data: {
        ...record,
        createdAt: db.serverDate()
      }
    })
  }

  const historyEntry = {
    date: material.date,
    title: material.title,
    mode: material.mode || 'daily-reading',
    articleTitle: material.dailyArticle && material.dailyArticle.title || '',
    articleUrl: material.dailyArticle && material.dailyArticle.url || '',
    articleColumn: material.dailyArticle && material.dailyArticle.column || '',
    articleCount: material.dailyArticle ? 1 : 0,
    hasCopyText: Boolean(material.copyText),
    updatedAt: db.serverDate()
  }

  const history = await db.collection(HISTORY_COLLECTION)
    .where({ date: material.date })
    .limit(1)
    .get()

  if (history.data.length > 0) {
    await db.collection(HISTORY_COLLECTION).doc(history.data[0]._id).update({
      data: historyEntry
    })
  } else {
    await db.collection(HISTORY_COLLECTION).add({
      data: {
        ...historyEntry,
        createdAt: db.serverDate()
      }
    })
  }
}

async function upsertJob(date, data) {
  const existing = await db.collection(JOB_COLLECTION)
    .where({ date })
    .limit(1)
    .get()

  if (existing.data.length > 0) {
    const id = existing.data[0]._id
    await db.collection(JOB_COLLECTION).doc(id).update({ data })
    return { ...existing.data[0], ...data, _id: id, date }
  }

  const added = await db.collection(JOB_COLLECTION).add({
    data: {
      date,
      createdAt: db.serverDate(),
      ...data
    }
  })
  return { _id: added._id, date, ...data }
}

async function updateJob(id, data) {
  if (!id) return null
  return db.collection(JOB_COLLECTION).doc(id).update({ data })
}

async function getJobById(id) {
  const res = await db.collection(JOB_COLLECTION).doc(id).get()
  return res.data || null
}

async function findJobByDate(date, statuses) {
  const query = { date }
  if (statuses && statuses.length) {
    query.status = _.in(statuses)
  }
  const res = await db.collection(JOB_COLLECTION)
    .where(query)
    .limit(1)
    .get()
  return res.data[0] || null
}

async function findActiveJob() {
  const res = await db.collection(JOB_COLLECTION)
    .where({ status: _.in(['processing', 'summarizing', 'assembling', 'finalizing']) })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function findMaterial(date) {
  const res = await db.collection(MATERIAL_COLLECTION)
    .where({ date })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function getStatus(date) {
  const material = await findMaterial(date)
  const job = await findJobByDate(date)
  return {
    success: true,
    date,
    hasMaterial: Boolean(material),
    materialTitle: material && material.material ? material.material.title : '',
    job: job ? {
      id: job._id,
      status: job.status,
      cursor: job.cursor || 0,
      total: asArray(job.articles).length,
      moduleCursor: Number(job.moduleCursor || 0),
      moduleTotal: MODULE_KEYS.length,
      moduleValidations: job.moduleValidations || {},
      failedModule: job.failedModule || '',
      errors: asArray(job.errors).length,
      errorMessage: job.errorMessage || '',
      validationErrors: asArray(job.validationErrors)
    } : null
  }
}

async function ensureCollections() {
  const names = [MATERIAL_COLLECTION, HISTORY_COLLECTION, JOB_COLLECTION]
  for (const name of names) {
    try {
      if (typeof db.createCollection === 'function') {
        await db.createCollection(name)
      }
    } catch (err) {
      const message = String(err.message || err.errMsg || '')
      if (!message.includes('exist') && !message.includes('已存在')) {
        console.warn(`ensure collection ${name} failed:`, message)
      }
    }
  }
}

function shouldAutoStartNow() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const after730 = hour > 7 || (hour === 7 && minute >= 30)
  return after730 && hour < 12
}

function extractJsonObject(text) {
  const source = String(text || '').trim()
  const fence = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : source
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('DeepSeek 未返回可解析 JSON')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}
