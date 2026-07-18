const http = require('http')
const fs = require('fs')
const path = require('path')

const {
  getPreviousDate,
  getTodayChinaDate,
  formatChineseDate,
  buildGenerationPrompt,
  buildCopyText,
  buildPublishMaterial,
  validateMaterial
} = require('./lib/material-core')
const { collectArticles } = require('./lib/people-client')
const { callDeepSeek, extractJsonObject } = require('./lib/deepseek-client')

const ROOT = __dirname
const PUBLIC_DIR = path.join(ROOT, 'public')
const OUTPUT_DIR = path.join(ROOT, 'output')
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1')

loadEnv(path.join(ROOT, '.env'))
ensureDir(OUTPUT_DIR)

const scheduler = {
  running: false,
  lastRunKey: '',
  lastMessage: '等待 7:30 自动生成'
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  lines.forEach(line => {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) return
    const index = clean.indexOf('=')
    if (index === -1) return
    const key = clean.slice(0, index).trim()
    const value = clean.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  })
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error('请求体不是有效 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname))
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  }[ext] || 'application/octet-stream'

  res.writeHead(200, { 'Content-Type': type })
  fs.createReadStream(filePath).pipe(res)
}

function getStatus() {
  const today = getTodayChinaDate()
  const targetDate = getPreviousDate(today)
  return {
    today,
    targetDate,
    targetDateLabel: formatChineseDate(targetDate),
    deepSeekReady: Boolean(process.env.DEEPSEEK_API_KEY),
    publishReady: Boolean(process.env.PUBLISH_FUNCTION_URL),
    publishUrl: process.env.PUBLISH_FUNCTION_URL ? maskUrl(process.env.PUBLISH_FUNCTION_URL) : '',
    autoGenerate: process.env.AUTO_GENERATE !== '0',
    scheduler
  }
}

function maskUrl(url) {
  return url.length > 42 ? `${url.slice(0, 28)}...${url.slice(-10)}` : url
}

function buildFallbackDraft(targetDate, articles) {
  const usable = articles.filter(item => !item.error)
  const article = usable[0] || null
  if (!article) {
    return {
      date: targetDate,
      sourceDateLabel: formatChineseDate(targetDate),
      generatedBy: 'local-rule',
      dailyArticle: null,
      selection: {
        reason: '当天没有采集到通过时效校验的人民网观点文章。',
        topic: '无',
        questions: [],
        skipped: '无',
        qualityCheck: '⚠️ 日期/来源不一致，注意'
      },
      framework: {},
      toolbox: {},
      practice: {}
    }
  }

  const dailyArticle = {
    ...article,
    originalDate: targetDate,
    publishDate: targetDate,
    mainTopic: '公共治理',
    applicableQuestions: ['分析题', '对策题', '大作文（分论点/结尾）'],
    structure: {
      intro: `由《${article.title}》涉及的现实议题引入，提出公共治理要回应群众关切。`,
      analysis: '从问题导向、价值导向和治理效能维度剖析，指出治理短板会影响公众获得感。',
      measure: '提出完善制度供给、强化协同联动、提升执行质效等对策。',
      elevation: '结合中国式现代化和基层治理背景，呼吁把民生小事办成治理实事。'
    },
    countermeasure: {
      subject: '党委政府、职能部门、基层组织、社会力量',
      method: '通过制度规范、数字赋能、宣传引导和监督评价',
      content: '开展专项治理，建立问题发现、处置、反馈闭环',
      purpose: '解决治理堵点，提升公共服务和基层治理效能'
    },
    formalWords: [
      { plain: '大家一起去想办法', formal: '凝聚共识，形成合力 / 多元共治' }
    ],
    highFrequencyPhrases: ['问题导向', '多元共治', '闭环治理'],
    quotes: [
      { text: '把群众身边的小事办实，才能托起基层治理的大格局。', usage: '适用于“基层治理/民生服务”主题，可作分论点段首句' }
    ],
    caseMaterials: [
      { fact: `以《${article.title}》所涉公共治理议题为例，说明治理要回应群众关切、形成闭环。`, usage: '基层治理/举例论证' }
    ],
    logicChain: ['切民生小事', '找治理堵点', '明多元责任', '建闭环机制', '升治理效能'],
    corePoint: '只有坚持问题导向，才能提升公共治理的针对性和实效性。',
    themes: ['公共治理', '民生服务']
  }

  return {
    date: targetDate,
    sourceDateLabel: formatChineseDate(targetDate),
    generatedBy: 'local-rule',
    dailyArticle,
    selection: {
      reason: '本地兜底模式优先选择同日可用文章，保证日期、标题和链接真实可核。',
      topic: '公共治理',
      archiveTheme: '公共治理',
      use: '主题精读',
      role: '今天只沉淀一套公共治理骨架、一组对策表达和一个10分钟微练。',
      questions: ['分析题', '对策题', '大作文'],
      skipped: usable.slice(1).map(item => `${item.column || '人民网观点'}《${item.title}》`).join('、') || '无',
      qualityCheck: '✅ 日期/来源一致'
    },
    framework: {
      centerPoint: dailyArticle.corePoint,
      transferStructure: '现象切入 - 问题剖析 - 机制施策 - 价值升华',
      answerFocus: '适用于基层治理、民生服务、公共服务类分析题和对策题。',
      logicChain: dailyArticle.logicChain,
      chain: {
        intro: dailyArticle.structure.intro,
        analysis: dailyArticle.structure.analysis,
        measure: dailyArticle.structure.measure,
        elevation: dailyArticle.structure.elevation
      }
    },
    toolbox: {
      countermeasure: dailyArticle.countermeasure,
      caseExtraction: '金句和案例各保留1个，避免贪多。',
      formalWords: dailyArticle.formalWords,
      highFrequencyPhrases: dailyArticle.highFrequencyPhrases,
      goldenSentences: dailyArticle.quotes,
      goldenSentence: {
        text: dailyArticle.quotes[0].text,
        usage: dailyArticle.quotes[0].usage
      },
      caseMaterials: dailyArticle.caseMaterials,
      themes: dailyArticle.themes
    },
    practice: {
      task: `用120字以内回答：如何结合《${dailyArticle.title}》提升公共治理实效？`,
      timeBox: '10分钟',
      prompt: '只写一段：先点出问题或意义，再写1条“主体+手段+行动+目标”的对策。',
      selfCheck: '有明确主体，有具体动作，有规范表达。',
      mustRemember: dailyArticle.quotes[0].text,
      nextLink: '明天只补一个同主题案例或表达。'
    }
  }
}

async function generateMaterial(targetDate, providedArticles) {
  const articles = providedArticles && providedArticles.length
    ? providedArticles
    : await collectArticles(targetDate)

  let draft
  let modelText = ''
  if (process.env.DEEPSEEK_API_KEY) {
    const prompt = buildGenerationPrompt({ targetDate, articles })
    const response = await callDeepSeek(prompt)
    modelText = response.text
    draft = extractJsonObject(modelText)
  } else {
    draft = buildFallbackDraft(targetDate, articles)
  }

  draft.date = draft.date || targetDate
  draft.sourceDateLabel = draft.sourceDateLabel || formatChineseDate(targetDate)
  const material = buildPublishMaterial(draft)
  const validation = validateMaterial(material, targetDate, articles)
  if (!validation.valid) {
    throw new Error(`素材质量校验失败：${validation.errors.join('；')}`)
  }
  return { material, articles, draft, modelText }
}

function saveOutput(material, articles, suffix = 'draft') {
  const filePath = path.join(OUTPUT_DIR, `${material.date}-${suffix}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ material, articles }, null, 2), 'utf8')
  return filePath
}

function postJson(url, payload) {
  const body = JSON.stringify(payload)
  const target = new URL(url)
  const client = target.protocol === 'https:' ? require('https') : require('http')
  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, res => {
      let responseBody = ''
      res.on('data', chunk => { responseBody += chunk })
      res.on('end', () => {
        try {
          const parsed = responseBody ? JSON.parse(responseBody) : {}
          resolve({ statusCode: res.statusCode, body: parsed })
        } catch (err) {
          reject(new Error(`发布响应不是 JSON：${responseBody.slice(0, 200)}`))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('发布请求超时')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function publishMaterial(material, articles) {
  const savedPath = saveOutput(material, articles, 'publish')
  const publishUrl = process.env.PUBLISH_FUNCTION_URL
  if (!publishUrl) {
    return {
      success: false,
      savedPath,
      error: '未配置 PUBLISH_FUNCTION_URL，已先保存本地发布文件'
    }
  }

  const response = await postJson(publishUrl, {
    adminSecret: process.env.PUBLISH_ADMIN_SECRET || '',
    material,
    articles
  })
  const ok = response.statusCode >= 200 && response.statusCode < 300 && response.body.success
  return {
    success: Boolean(ok),
    savedPath,
    response: response.body,
    error: ok ? '' : (response.body.error || `HTTP ${response.statusCode}`)
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      sendJson(res, 200, { success: true, data: getStatus() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/collect') {
      const body = await readBody(req)
      const targetDate = body.targetDate || getStatus().targetDate
      const articles = await collectArticles(targetDate)
      sendJson(res, 200, { success: true, targetDate, articles })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = await readBody(req)
      const targetDate = body.targetDate || getStatus().targetDate
      const result = await generateMaterial(targetDate, body.articles || [])
      const savedPath = saveOutput(result.material, result.articles, 'draft')
      sendJson(res, 200, { success: true, ...result, savedPath })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/format') {
      const body = await readBody(req)
      const draft = body.draft || {}
      const copyText = body.copyText || buildCopyText(draft)
      const material = buildPublishMaterial({ ...draft, copyText })
      sendJson(res, 200, { success: true, material })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const body = await readBody(req)
      if (!body.material || !body.material.date || !body.material.copyText) {
        sendJson(res, 400, { success: false, error: '缺少 material.date 或 material.copyText' })
        return
      }
      const result = await publishMaterial(body.material, body.articles || [])
      sendJson(res, result.success ? 200 : 202, result)
      return
    }

    sendJson(res, 404, { success: false, error: 'API not found' })
  } catch (err) {
    sendJson(res, 500, { success: false, error: err.message })
  }
}

function getChinaClock() {
  const now = new Date()
  const china = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return {
    date: toDateString(china),
    hour: china.getUTCHours(),
    minute: china.getUTCMinutes()
  }
}

function toDateString(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function runDailyJob(targetDate) {
  if (scheduler.running) return
  scheduler.running = true
  scheduler.lastMessage = `正在生成 ${targetDate}`
  try {
    const result = await generateMaterial(targetDate)
    const publish = await publishMaterial(result.material, result.articles)
    scheduler.lastRunKey = targetDate
    scheduler.lastMessage = publish.success
      ? `${targetDate} 已生成并发布`
      : `${targetDate} 已生成，等待配置发布 URL`
  } catch (err) {
    scheduler.lastMessage = `${targetDate} 自动生成失败：${err.message}`
  } finally {
    scheduler.running = false
  }
}

function startScheduler() {
  setInterval(() => {
    if (process.env.AUTO_GENERATE === '0') return
    const clock = getChinaClock()
    if (clock.hour !== 7 || clock.minute !== 30) return
    const targetDate = getPreviousDate(clock.date)
    if (scheduler.lastRunKey === targetDate) return
    runDailyJob(targetDate)
  }, 30000)
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res)
    return
  }
  serveStatic(req, res)
})

server.listen(PORT, HOST, () => {
  console.log(`申论素材后台已启动：http://${HOST}:${PORT}`)
  console.log(`默认生成日期：${getStatus().targetDateLabel}`)
})

startScheduler()
