const ONE_DAY = 24 * 60 * 60 * 1000
const MODULE_KEYS = ['selection', 'framework', 'toolbox', 'practice']

function parseDateParts(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!match) throw new Error(`Invalid date: ${date}`)
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function toDateString(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPreviousDate(date) {
  const { year, month, day } = parseDateParts(date)
  const utc = Date.UTC(year, month - 1, day)
  return toDateString(new Date(utc - ONE_DAY))
}

function getTodayChinaDate() {
  const now = new Date()
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return toDateString(chinaTime)
}

function formatChineseDate(date) {
  const { year, month, day } = parseDateParts(date)
  return `${year}年${month}月${day}日`
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function cleanText(value, fallback = '') {
  const selected = value === undefined || value === null || value === '' ? fallback : value
  if (selected && typeof selected === 'object') return String(fallback || '').trim()
  return String(selected || '').trim()
}

const BAD_COPY_TOKENS = [
  '今日精读文章',
  '未命名文章',
  '原文表述待提取',
  '原文表达待提取',
  '规范表达待完善',
  '可迁移表达待补充',
  '今日没有通过时效校验',
  '[object Object]',
  'undefined'
]

function countOccurrences(source, token) {
  return (String(source || '').match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
}

function hasRepeatedCopyBlocks(copyText) {
  const source = String(copyText || '')
  const repeatedToolboxBlocks = [
    '【规范词替换】',
    '【高频短语】',
    '【金句】',
    '【案例】',
    '【对策四要素】'
  ].some(token => countOccurrences(source, token) > 1)

  const repeatedMainBlocks = [
    '📌 今日选文',
    '🧭 骨架拆解',
    '🧩 素材工具箱',
    '📝 10分钟微练'
  ].some(token => countOccurrences(source, token) > 1)

  return repeatedToolboxBlocks || repeatedMainBlocks
}

function isBadCopyText(copyText) {
  const source = cleanText(copyText, '')
  if (!source) return true
  if (BAD_COPY_TOKENS.some(token => source.includes(token))) return true
  if (hasRepeatedCopyBlocks(source)) return true
  if (!source.startsWith('【日期】')) return true
  if (!source.includes('原文链接｜http')) return true
  if (!/标题：《[^》]+》/.test(source)) return true
  return !['📌 今日选文', '🧭 骨架拆解', '🧩 素材工具箱', '📝 10分钟微练']
    .every(token => source.includes(token))
}

function stableId(value) {
  const source = cleanText(value, 'article')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i)
    hash |= 0
  }
  return `article-${Math.abs(hash)}`
}

function normalizeIdentity(value) {
  return cleanText(value, '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/[\s“”‘’《》【】（）()：:，,。.!！?？\-_/]/g, '')
}

function normalizeQuote(quote) {
  if (typeof quote === 'string') return { text: quote, usage: '适用于申论/面试答题' }
  return {
    text: cleanText(quote && (quote.text || quote.quote), '可迁移表达待补充'),
    usage: cleanText(quote && (quote.usage || quote.scene), '申论/面试答题')
  }
}

function normalizeLogicChain(value) {
  return asArray(value)
    .map(item => cleanText(item, ''))
    .filter(Boolean)
    .slice(0, 5)
}

function normalizeCaseMaterial(value) {
  if (typeof value === 'string') return { fact: value, usage: '申论/面试举例论证' }
  return {
    fact: cleanText(value && (value.fact || value.text || value.case || value.content), ''),
    usage: cleanText(value && (value.usage || value.scene), '申论/面试举例论证')
  }
}

function normalizePhrases(value) {
  return asArray(value)
    .map(item => cleanText(item, ''))
    .filter(Boolean)
    .slice(0, 3)
}

function limitChineseText(value, maxLength) {
  const text = cleanText(value, '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function normalizeReadingArticle(article) {
  const item = article || {}
  const ai = item.aiResult || item
  const structure = ai.structure || {}
  const detail = ai.countermeasuresDetail || ai.countermeasure || {}
  const standardWords = ai.standardWords || {}
  const goldenSentence = ai.goldenSentence || {}
  const themes = asArray(ai.themes || ai.tags || ai.mainTopic).filter(Boolean)
  const mainTopic = cleanText(ai.mainTopic || themes[0], '公共治理')
  const formalWords = asArray(ai.formalWords).length
    ? asArray(ai.formalWords)
    : [{ plain: standardWords.original, formal: standardWords.standard }]
  const normalizedFormalWords = formalWords.map(word => ({
    plain: cleanText(word && (word.plain || word.original), ''),
    formal: cleanText(word && (word.formal || word.standard), '')
  })).filter(word => word.plain || word.formal)
  const inferredFormal = inferFormalPair({ ...item, mainTopic }, mainTopic)
  const repairedFormalWords = normalizedFormalWords.length && !isWeakStandardWord(normalizedFormalWords[0].plain, normalizedFormalWords[0].formal)
    ? normalizedFormalWords
    : [inferredFormal]
  const quotes = asArray(ai.quotes).length
    ? asArray(ai.quotes)
    : [{ text: goldenSentence.sentence, usage: goldenSentence.scenario }]
  const normalizedQuotes = quotes
    .map(normalizeQuote)
    .filter(quote => !isMissingContent(quote.text))
  const caseMaterials = asArray(ai.caseMaterials).length
    ? asArray(ai.caseMaterials)
    : [ai.caseMaterial || item.caseMaterial]
  const highFrequencyPhrases = normalizePhrases(
    ai.highFrequencyPhrases || ai.phrases || ai.highFrequencyWords || item.highFrequencyPhrases
  )

  return {
    id: cleanText(item.id, stableId(item.url || item.title)),
    column: cleanText(item.column, '人民网观点'),
    title: cleanText(item.title, '未命名文章'),
    originalDate: cleanText(item.originalDate || item.publishDate, ''),
    publishDate: cleanText(item.publishDate || item.originalDate, ''),
    url: cleanText(item.url, ''),
    mainTopic,
    applicableQuestions: asArray(ai.applicableQuestions).length
      ? asArray(ai.applicableQuestions)
      : ['分析题', '对策题', '大作文'],
    structure: {
      intro: cleanText(structure.intro, '由现实问题或政策背景引入，提出核心论点。'),
      analysis: cleanText(structure.analysis, '从问题根源、现实影响或价值意义展开剖析。'),
      measure: cleanText(structure.measure || structure.countermeasures, '围绕问题短板提出针对性举措。'),
      elevation: cleanText(structure.elevation || structure.conclusion, '结合时代背景和公共价值进行升华。')
    },
    logicChain: normalizeLogicChain(ai.logicChain || item.logicChain),
    countermeasure: {
      subject: cleanText(detail.subject, '党委政府、职能部门、基层组织、社会力量'),
      method: cleanText(detail.method || detail.means, '制度规范、技术赋能、宣传引导、监督反馈'),
      content: cleanText(detail.content, '开展专项治理，建立长效机制'),
      purpose: cleanText(detail.purpose, '解决现实问题，提升治理效能')
    },
    formalWords: repairedFormalWords,
    highFrequencyPhrases,
    quotes: normalizedQuotes,
    caseMaterials: caseMaterials.map(normalizeCaseMaterial).filter(item => item.fact),
    corePoint: cleanText(ai.corePoint || ai.keyInsight || structure.analysis || ai.mainTopic, '围绕中心议题展开论证，体现问题导向与实践导向。'),
    themes,
    quote: cleanText(ai.quote || goldenSentence.sentence || (quotes[0] && quotes[0].text), ''),
    macroDirection: cleanText(ai.macroDirection || detail.purpose || structure.conclusion, '完善制度机制，加强协同治理'),
    microMeasures: asArray(ai.microMeasures || ai.measures).filter(Boolean),
    error: cleanText(item.error, '')
  }
}

function isolateSummary(summary) {
  const item = normalizeReadingArticle(summary)
  return {
    ...item,
    structure: { ...(item.structure || {}) },
    countermeasure: { ...(item.countermeasure || {}) },
    formalWords: asArray(item.formalWords).map(word => ({ ...(word || {}) })),
    highFrequencyPhrases: asArray(item.highFrequencyPhrases).slice(),
    quotes: asArray(item.quotes).map(quote => ({ ...(quote || {}) })),
    caseMaterials: asArray(item.caseMaterials).map(caseItem => ({ ...(caseItem || {}) })),
    logicChain: asArray(item.logicChain).slice(),
    themes: asArray(item.themes).slice(),
    microMeasures: asArray(item.microMeasures).slice()
  }
}

function dedupeSummaries(summaries) {
  const seenUrls = new Set()
  const seenTitles = new Set()
  const result = []

  asArray(summaries).forEach(summary => {
    const item = isolateSummary(summary)
    const urlKey = normalizeIdentity(item.url)
    const titleKey = normalizeIdentity(item.title)
    if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) return
    seenUrls.add(urlKey)
    seenTitles.add(titleKey)
    result.push(item)
  })

  return result
}

function scoreArticle(article) {
  const title = cleanText(article && article.title, '')
  const column = cleanText(article && article.column, '')
  let score = 0
  if (column.includes('今日谈')) score += 8
  if (column.includes('人民时评')) score += 7
  if (column.includes('人民锐评')) score += 7
  if (/评论员观察|人民时评|人民锐评|今日谈/.test(title)) score += 7
  if (/人才|评价|算力|科技|基层|治理|发展|民生|消费|法治|文化|安全|创新|乡村|粮食/.test(title)) score += 6
  if (/行进中国|地方|雅安|川藏/.test(title)) score -= 4
  if (title.length >= 8 && title.length <= 28) score += 2
  return score
}

function classifyArticleUse(article) {
  const title = cleanText(article && article.title, '')
  const column = cleanText(article && article.column, '')
  if (/行进中国|雅安|川藏|地方/.test(title)) {
    return {
      use: '案例素材',
      role: '不重点模仿全文结构，重点提取事实、做法和成效，用作大作文举例论证。',
      structure: '案例背景 - 具体做法 - 实际成效 - 主题迁移'
    }
  }
  if (/人民时评|人民锐评|评论员观察/.test(`${column}${title}`)) {
    return {
      use: '结构范本',
      role: '重点模仿分论点展开、原因分析和对策承接，适合训练大作文论证段。',
      structure: '现象切入 - 问题剖析 - 机制施策 - 价值升华'
    }
  }
  if (column.includes('今日谈')) {
    return {
      use: '短评表达训练',
      role: '重点训练从生活小切口提炼大主题，并积累短句式规范表达。',
      structure: '小切口 - 快判断 - 规范表达 - 价值呼吁'
    }
  }
  return {
    use: '主题精读',
    role: '围绕高频主题沉淀结构、表达和对策，作为知识树的一篇母题材料。',
    structure: '现象切入 - 问题剖析 - 机制施策 - 价值升华'
  }
}

function classifyThemeArchive(article, fallbackTheme) {
  const source = `${cleanText(article && article.title, '')}${cleanText(article && article.mainTopic, '')}${asArray(article && article.themes).join('')}`
  if (/人才|评价/.test(source)) return '人才发展'
  if (/算力|数字|科技|AI|人工智能|创新/.test(source)) return '数字经济与科技创新'
  if (/基层|治理|社区|物业/.test(source)) return '基层治理'
  if (/区域|协作|川藏|雅安|地方/.test(source)) return '区域协调发展'
  if (/乡村|农业|粮食|耕地/.test(source)) return '乡村振兴与粮食安全'
  if (/消费|售后|维权/.test(source)) return '消费维权'
  if (/文化|路牌|城市形象/.test(source)) return '文化建设'
  if (/安全|防汛|应急/.test(source)) return '公共安全'
  return cleanText(fallbackTheme, '公共治理')
}

function selectDailyArticle(summaries) {
  const usable = dedupeSummaries(summaries)
    .filter(item => item && !item.error && item.url && item.title && !String(item.title).includes('抓取失败'))
  return usable.sort((a, b) => scoreArticle(b) - scoreArticle(a))[0] || null
}

function extractUrlDate(url) {
  const match = cleanText(url, '').match(/\/n1\/(\d{4})\/(\d{2})(\d{2})\//)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function isWeakStandardWord(original, standard) {
  const plain = cleanText(original, '')
  const formal = cleanText(standard, '')
  const weakWords = new Set([
    '人工智能发展失衡',
    '粮食生产连年丰收',
    '粮食稳产保供根基',
    '粮食稳产保供',
    '规范表达待完善'
  ])
  if (!formal || weakWords.has(formal)) return true
  if (normalizeIdentity(plain) === normalizeIdentity(formal)) return true
  if (/根基$/.test(formal) && !/根基夯实$/.test(formal)) return true
  if (/粮食/.test(plain) && /(丰收|稳产|保供)/.test(plain) && /^(粮食)?(生产)?(稳产|保供|丰收|安全|根基){2,}$/.test(formal)) return true
  return false
}

function inferFormalPair(article, archiveTheme) {
  const source = `${cleanText(article && article.title, '')}${cleanText(article && article.mainTopic, '')}${archiveTheme || ''}`
  if (/人才|评价/.test(source)) return { plain: '看人不能只看头衔', formal: '实绩导向评价体系' }
  if (/算力|数字|科技|AI|人工智能|创新/.test(source)) return { plain: '不能只追求建得多', formal: '供给效能系统跃升' }
  if (/乡村|农业|粮食|耕地/.test(source)) return { plain: '粮食年年丰收', formal: '稳产保供根基夯实' }
  if (/消费|售后|维权/.test(source)) return { plain: '售后问题不好解决', formal: '消费维权闭环治理' }
  if (/文化|路牌|城市形象/.test(source)) return { plain: '大家跟风模仿', formal: '文化表达同质化' }
  if (/区域|协作|川藏|雅安|地方/.test(source)) return { plain: '地方之间要多配合', formal: '区域协同发展格局' }
  if (/基层|治理|社区|物业|民生/.test(source)) return { plain: '事情要有人管到底', formal: '治理责任闭环压实' }
  return { plain: '大家一起去想办法', formal: '多元协同治理格局' }
}

function isMissingContent(value) {
  const text = cleanText(value, '')
  if (!text || text === '无') return true
  return BAD_COPY_TOKENS.some(token => text.includes(token))
}

function inferLogicChain(article, articleUse, archiveTheme) {
  const existing = normalizeLogicChain(article && article.logicChain)
  if (existing.length >= 4) return existing

  const source = `${cleanText(article && article.title, '')}${cleanText(article && article.mainTopic, '')}${archiveTheme || ''}`
  if (/人才|评价/.test(source)) {
    return ['切评价偏差', '破唯帽旧弊', '立实绩标准', '健分类机制', '服务人才强国']
  }
  if (/算力|数字|科技|AI|人工智能|创新/.test(source)) {
    return ['切算力热潮', '破重建轻用', '优供需匹配', '提调度效能', '支撑数字中国']
  }
  if (/区域|协作|川藏|雅安|地方/.test(source)) {
    return ['切区位变化', '破协作堵点', '强通道联动', '促产业协同', '服务区域协调']
  }
  if (/乡村|农业|粮食|耕地/.test(source)) {
    return ['切稳产需求', '守耕地红线', '强科技支撑', '健保供机制', '夯粮安根基']
  }
  if (/消费|售后|维权/.test(source)) {
    return ['切消费痛点', '破售后乱象', '明平台责任', '畅维权渠道', '护消费信心']
  }
  if (/文化|路牌|城市形象/.test(source)) {
    return ['切出圈现象', '破同质表达', '深挖地方文脉', '规范传播秩序', '涵养城市气质']
  }
  if (/基层|治理|社区|物业|民生/.test(source)) {
    return ['切民生小事', '找治理堵点', '明多元责任', '建闭环机制', '升治理效能']
  }
  if (articleUse && articleUse.use === '案例素材') {
    return ['切具体案例', '找发展支点', '提关键做法', '看实际成效', '迁移大主题']
  }
  return ['切现实议题', '找问题症结', '明主体责任', '建长效机制', '升治理效能']
}

function buildCaseMaterials(article, archiveTheme, isCaseMaterial) {
  const existing = asArray(article && article.caseMaterials)
    .map(normalizeCaseMaterial)
    .filter(item => item.fact)
    .slice(0, 2)
  if (existing.length) return existing

  const title = cleanText(article && article.title, '今日文章')
  const topic = cleanText(article && article.mainTopic, archiveTheme || '公共治理')
  const content = cleanText(article && article.countermeasure && article.countermeasure.content, '')
  const core = cleanText(article && article.corePoint, '')
  const fact = isCaseMaterial
    ? `《${title}》呈现“${topic}”中的具体做法：${content || core || '把具体实践转化为发展成效'}。`
    : `以《${title}》所涉“${topic}”议题为例，说明${content || core || '治理要坚持问题导向和效果导向'}。`

  return [{ fact, usage: `${archiveTheme || topic}/举例论证` }]
}

function buildHighFrequencyPhrases(article, archiveTheme) {
  const existing = normalizePhrases(article && article.highFrequencyPhrases)
  const formal = cleanText(article && article.formalWords && article.formalWords[0] && article.formalWords[0].formal, '')
  const method = cleanText(article && article.countermeasure && article.countermeasure.method, '')
  const purpose = cleanText(article && article.countermeasure && article.countermeasure.purpose, '')
  const topic = cleanText(archiveTheme || article && article.mainTopic, '公共治理')
  const source = `${cleanText(article && article.title, '')}${topic}`
  let topicDefaults = ['精准施策', '协同治理', '闭环落实']
  if (/人才|评价/.test(source)) topicDefaults = ['实绩导向', '分类评价', '人才活力']
  if (/算力|数字|科技|AI|人工智能|创新/.test(source)) topicDefaults = ['供需匹配', '效能跃升', '场景牵引']
  if (/乡村|农业|粮食|耕地/.test(source)) topicDefaults = ['稳产保供', '科技支撑', '底线思维']
  if (/消费|售后|维权/.test(source)) topicDefaults = ['明责履约', '维权闭环', '消费信心']
  if (/文化|路牌|城市形象/.test(source)) topicDefaults = ['文脉转化', '差异表达', '有序传播']
  if (/区域|协作|川藏|雅安|地方/.test(source)) topicDefaults = ['区域协同', '产业联动', '通道支撑']
  if (/基层|治理|社区|物业|民生/.test(source)) topicDefaults = ['多元共治', '责任闭环', '民生导向']
  const candidates = [
    ...existing,
    formal,
    method,
    purpose,
    ...topicDefaults
  ]
    .map(item => cleanText(item, ''))
    .filter(Boolean)

  return [...new Set(candidates)].slice(0, 3)
}

function formatLimitedItems(items, fallback) {
  const values = asArray(items)
    .map(item => {
      if (typeof item === 'string') return item
      return cleanText(item && (item.text || item.fact || item.quote || item.case), '')
    })
    .filter(item => item && item !== '无')
    .slice(0, 2)
  if (!values.length) return fallback
  return values.map((item, index) => values.length === 1 ? item : `${index + 1}. ${item}`).join('；')
}

function formatQuestionChecklist(questions) {
  const includes = pattern => asArray(questions).some(item => pattern.test(cleanText(item, '')))
  const mark = pattern => includes(pattern) ? '☑' : '□'
  const values = [
    `${mark(/概括/)}概括`,
    `${mark(/分析/)}分析`,
    `${mark(/对策/)}对策`,
    `${mark(/大作文|分论点/)}大作文分论点`,
    `${mark(/面试|综合分析/)}面试综合分析`
  ]
  return values.join(' ')
}

function getPracticeOptions(date) {
  const options = [
    'A. 用100字概括本文',
    'B. 用“主体+手段+行动+目标”写一条对策',
    'C. 仿写一个分论点'
  ]
  let index = 0
  try {
    index = (parseDateParts(date).day - 1) % options.length
  } catch (err) {
    index = 0
  }
  return options.map((text, optionIndex) => `${optionIndex === index ? '☑' : '□'} ${text}`)
}

function buildReadingDraft(article, targetDate, sourceArticles) {
  const selected = normalizeReadingArticle(article)
  const skipped = asArray(sourceArticles)
    .filter(item => item && item.title && !item.error && normalizeIdentity(item.url) !== normalizeIdentity(selected.url))
    .map(item => `${item.column || '人民网观点'}《${item.title}》`)
  const formal = selected.formalWords[0] || inferFormalPair(selected, selected.mainTopic)
  const quote = selected.quotes.find(item => item && !isMissingContent(item.text)) || {}
  const themes = selected.themes.length ? selected.themes : [selected.mainTopic]
  const practiceTheme = cleanText(themes[0], '公共治理')
  const articleUse = classifyArticleUse(selected)
  const archiveTheme = classifyThemeArchive(selected, practiceTheme)
  const isCaseMaterial = articleUse.use === '案例素材'
  const logicChain = inferLogicChain(selected, articleUse, archiveTheme)
  const rememberText = cleanText(quote.text, cleanText(formal.formal, '多元协同治理格局'))
  const goldenSentences = selected.quotes
    .filter(item => item.text && item.text !== '无')
    .slice(0, 2)
  if (!goldenSentences.length) {
    goldenSentences.push({ text: rememberText, usage: practiceTheme })
  }
  const caseMaterials = buildCaseMaterials(selected, archiveTheme, isCaseMaterial)
  const highFrequencyPhrases = buildHighFrequencyPhrases(selected, archiveTheme)

  return {
    date: targetDate,
    sourceDateLabel: formatChineseDate(targetDate),
    dailyArticle: selected,
    selection: {
      reason: limitChineseText(`${archiveTheme}迁移性强，适合${articleUse.use}`, 30),
      topic: practiceTheme,
      archiveTheme,
      use: articleUse.use,
      role: articleUse.role,
      questions: selected.applicableQuestions,
      skipped: skipped.length ? skipped.join('、') : '无',
      qualityCheck: '✅ 日期/来源一致'
    },
    framework: {
      centerPoint: selected.corePoint,
      transferStructure: articleUse.structure,
      answerFocus: isCaseMaterial
        ? `可作为“${archiveTheme}”主题下的事实案例，用于支撑分论点，不必背诵复杂地名和细节。`
        : `归入“${archiveTheme}”知识树，可迁移到${selected.applicableQuestions.join('、')}。`,
      logicChain,
      chain: {
        intro: selected.structure.intro,
        analysis: selected.structure.analysis,
        measure: selected.structure.measure,
        elevation: selected.structure.elevation
      }
    },
    toolbox: {
      countermeasure: selected.countermeasure,
      caseExtraction: isCaseMaterial
        ? '提取“背景、做法、成效”三项即可，写作时压缩成一两句话。'
        : `把本文作为“${archiveTheme}”母题范文，金句和案例各保留1个，避免贪多。`,
      formalWords: [{
        plain: cleanText(formal.plain, inferFormalPair(selected, archiveTheme).plain),
        formal: cleanText(formal.formal, inferFormalPair(selected, archiveTheme).formal)
      }],
      highFrequencyPhrases,
      goldenSentences,
      goldenSentence: {
        text: rememberText,
        usage: cleanText(quote.usage, practiceTheme)
      },
      caseMaterials,
      themes
    },
    practice: {
      task: `用120字以内回答：如何把“${practiceTheme}”相关要求转化为治理实效？`,
      timeBox: '10分钟',
      prompt: '只写一段：先点出问题或意义，再写1条“主体+手段+行动+目标”的对策。',
      selfCheck: '有明确主体，有具体动作，有规范表达；不再另写概括题、分论点和复盘长表。',
      mustRemember: rememberText,
      nextLink: `把今天文章归入“${archiveTheme}”知识树，明天只补一个同主题案例或表达。`
    }
  }
}

function summarizeFinalDraft(summaries, targetDate, sourceArticles) {
  const selected = selectDailyArticle(summaries)
  if (!selected) {
    return {
      date: targetDate,
      sourceDateLabel: formatChineseDate(targetDate),
      dailyArticle: null,
      selection: {},
      framework: {},
      toolbox: {},
      practice: {}
    }
  }
  return buildReadingDraft(selected, targetDate, sourceArticles)
}

function buildModuleDraft(moduleKey, summaries, targetDate, sourceArticles) {
  if (!MODULE_KEYS.includes(moduleKey)) throw new Error(`未知模块：${moduleKey}`)
  const draft = summarizeFinalDraft(summaries, targetDate, sourceArticles)
  return {
    dailyArticle: draft.dailyArticle,
    [moduleKey]: draft[moduleKey] || {}
  }
}

function mergeModuleDrafts(moduleDrafts, targetDate) {
  const modules = moduleDrafts || {}
  const article = MODULE_KEYS
    .map(key => modules[key] && modules[key].dailyArticle)
    .find(Boolean) || null

  return {
    date: targetDate,
    sourceDateLabel: formatChineseDate(targetDate),
    dailyArticle: article,
    selection: modules.selection && modules.selection.selection || {},
    framework: modules.framework && modules.framework.framework || {},
    toolbox: modules.toolbox && modules.toolbox.toolbox || {},
    practice: modules.practice && modules.practice.practice || {}
  }
}

function validateArticleIdentity(article, targetDate, sourceArticles, errors, prefix) {
  const item = article || {}
  const title = cleanText(item.title, '')
  const url = cleanText(item.url, '')
  const urlKey = normalizeIdentity(url)
  const sourceByUrl = new Map(
    asArray(sourceArticles)
      .filter(source => source && source.url)
      .map(source => [normalizeIdentity(source.url), source])
  )
  const source = sourceByUrl.get(urlKey)

  if (!title || !url) errors.push(`${prefix}文章标题或网址缺失`)
  if (!source) errors.push(`${prefix}文章不在当日采集源中`)
  if (source && cleanText(source.title, '') !== title) errors.push(`${prefix}文章标题与网址不匹配`)
  if (extractUrlDate(url) !== targetDate) errors.push(`${prefix}文章链接日期不是${targetDate}`)
  if (item.originalDate && item.originalDate !== targetDate) errors.push(`${prefix}文章发布日期不是${targetDate}`)
}

function validateModuleDraft(moduleKey, moduleDraft, targetDate, sourceArticles, completedModules) {
  const errors = []
  const article = moduleDraft && moduleDraft.dailyArticle
  validateArticleIdentity(article, targetDate, sourceArticles, errors, `${moduleKey} `)

  const previousArticle = MODULE_KEYS
    .map(key => completedModules && completedModules[key] && completedModules[key].dailyArticle)
    .find(Boolean)
  if (previousArticle && article && normalizeIdentity(previousArticle.url) !== normalizeIdentity(article.url)) {
    errors.push(`${moduleKey} 与已生成模块选文不一致`)
  }

  if (moduleKey === 'selection') {
    const selection = moduleDraft && moduleDraft.selection || {}
    if (!selection.reason || !selection.topic || !selection.archiveTheme || !selection.use || !asArray(selection.questions).length || !selection.qualityCheck) {
      errors.push('selection 模块字段不完整')
    }
  } else if (moduleKey === 'framework') {
    const framework = moduleDraft && moduleDraft.framework || {}
    const chain = framework.chain || {}
    const logicChain = normalizeLogicChain(framework.logicChain)
    if (!framework.centerPoint || !framework.transferStructure || !framework.answerFocus || !chain.intro || !chain.analysis || !chain.measure || !chain.elevation) {
      errors.push('framework 模块骨架字段不完整')
    }
    if (logicChain.length < 4) errors.push('framework 模块论证短链不足')
  } else if (moduleKey === 'toolbox') {
    const toolbox = moduleDraft && moduleDraft.toolbox || {}
    const countermeasure = toolbox.countermeasure || {}
    if (!toolbox.caseExtraction) errors.push('toolbox 模块素材提取说明不完整')
    if (!countermeasure.subject || !countermeasure.method || !countermeasure.content || !countermeasure.purpose) {
      errors.push('toolbox 模块对策四要素不完整')
    }
    const formalWords = asArray(toolbox.formalWords)
    if (!formalWords.length) errors.push('toolbox 模块表达升级缺失')
    formalWords.forEach(word => {
      if (isWeakStandardWord(word && word.plain, word && word.formal)) {
        errors.push(`toolbox 模块规范词无效：${cleanText(word && word.formal, '空')}`)
      }
    })
    if (normalizePhrases(toolbox.highFrequencyPhrases).length < 3) {
      errors.push('toolbox 模块高频短语不足3个')
    }
    const gs = toolbox.goldenSentence || {}
    if (isMissingContent(gs.text) || !gs.usage) errors.push('toolbox 模块金句或适用主题缺失')
    const validCases = asArray(toolbox.caseMaterials).map(normalizeCaseMaterial).filter(item => !isMissingContent(item.fact))
    if (!validCases.length) errors.push('toolbox 模块案例素材缺失')
  } else if (moduleKey === 'practice') {
    const practice = moduleDraft && moduleDraft.practice || {}
    if (!practice.task || !practice.timeBox || !practice.prompt || !practice.selfCheck || !practice.mustRemember) {
      errors.push('practice 模块字段不完整')
    }
  } else {
    errors.push(`未知模块：${moduleKey}`)
  }

  return { valid: errors.length === 0, errors }
}

function validateMaterial(material, targetDate, sourceArticles) {
  const data = material || {}
  const errors = []
  const copyText = cleanText(data.copyText, '')
  const article = data.dailyArticle

  validateArticleIdentity(article, targetDate, sourceArticles, errors, '')
  if (isBadCopyText(copyText)) {
    errors.push('成稿包含占位符、重复模块、缺少原文链接或模块不完整')
  }
  if (!copyText.startsWith(`【日期】${formatChineseDate(targetDate)} 申论/面试精读`)) {
    errors.push('成稿日期与目标日期不一致')
  }
  if (/\[object Object\]|\bundefined\b/.test(copyText)) {
    errors.push('成稿包含未正确格式化的对象或空值')
  }
  if (article && article.url && !copyText.includes(article.url)) {
    errors.push('文章链接未写入成稿')
  }
  if (!data.selection || !data.framework || !data.toolbox || !data.practice) {
    errors.push('精读模块不完整')
  }
  if (!article || !cleanText(article.title, '') || !cleanText(article.url, '')) {
    errors.push('缺少有效精读文章')
  }
  asArray(data.toolbox && data.toolbox.formalWords).forEach(word => {
    if (isWeakStandardWord(word && word.plain, word && word.formal)) {
      errors.push(`规范词未升级：${cleanText(word && word.formal, '空')}`)
    }
  })

  return { valid: errors.length === 0, errors }
}

function buildSelectionBlock(material) {
  const article = normalizeReadingArticle(material.dailyArticle)
  const selection = material.selection || {}
  return [
    `标题：《${article.title}》`,
    `来源：${article.column}`,
    `母题归档：${cleanText(selection.archiveTheme, article.mainTopic)}知识树`,
    `选择理由：${limitChineseText(selection.reason, 30)}`,
    `日期校验：${cleanText(selection.qualityCheck, '✅')}`
  ].join('\n')
}

function buildFrameworkBlock(material) {
  const framework = material.framework || material.argument || {}
  const selection = material.selection || {}
  const article = normalizeReadingArticle(material.dailyArticle)
  const chain = framework.chain || {}
  const questions = asArray(selection.questions).length ? asArray(selection.questions) : article.applicableQuestions
  const logicChain = normalizeLogicChain(framework.logicChain).length
    ? normalizeLogicChain(framework.logicChain)
    : inferLogicChain(article, classifyArticleUse(article), cleanText(selection.archiveTheme, article.mainTopic))
  return [
    `总论点：${cleanText(framework.centerPoint, '围绕中心议题展开论证，体现问题导向与实践导向。')}`,
    '',
    '论证短链（5节点）：',
    logicChain.join(' → '),
    '',
    `可迁移骨架：${cleanText(framework.transferStructure, '现象切入 - 问题剖析 - 机制施策 - 价值升华')}`,
    '',
    '适用题型（勾选）：',
    formatQuestionChecklist(questions)
  ].join('\n')
}

function buildToolboxBlock(material) {
  const toolbox = material.toolbox || {}
  const oldMethod = material.method || {}
  const oldExpression = material.expression || {}
  const article = normalizeReadingArticle(material.dailyArticle)
  const cm = toolbox.countermeasure || oldMethod.countermeasure || {}
  const archiveTheme = cleanText(material.selection && material.selection.archiveTheme, article.mainTopic)
  const rawFormal = asArray(toolbox.formalWords || oldExpression.formalWords)[0] || {}
  const inferredFormal = inferFormalPair(article, archiveTheme)
  const formal = isWeakStandardWord(rawFormal.plain, rawFormal.formal) ? inferredFormal : rawFormal
  const phrases = normalizePhrases(toolbox.highFrequencyPhrases).length
    ? normalizePhrases(toolbox.highFrequencyPhrases)
    : buildHighFrequencyPhrases(article, archiveTheme)
  const gs = toolbox.goldenSentence || oldExpression.goldenSentence || {}
  const goldenItems = asArray(toolbox.goldenSentences).length
    ? asArray(toolbox.goldenSentences)
    : [{ text: cleanText(gs.text || gs.sentence, cleanText(formal.formal, inferredFormal.formal)), usage: cleanText(gs.usage || gs.scenario, archiveTheme) }]
  const caseItems = asArray(toolbox.caseMaterials).length
    ? asArray(toolbox.caseMaterials)
    : buildCaseMaterials(article, archiveTheme, false)
  const themes = asArray(toolbox.themes || oldExpression.themes).length
    ? asArray(toolbox.themes || oldExpression.themes).map(item => `#${item}`).join(' ')
    : `#${archiveTheme || '公共治理'}`
  return [
    '【规范词替换】',
    `原：${cleanText(formal.plain, inferredFormal.plain)} → 申论：${cleanText(formal.formal, inferredFormal.formal)}`,
    '',
    '【高频短语】（3个）',
    ...phrases.map(item => `- ${item}`),
    '',
    '【金句】（必摘1句）',
    `「${formatLimitedItems(goldenItems.slice(0, 1), cleanText(formal.formal, inferredFormal.formal))}」`,
    `适用场景：${cleanText(gs.usage || gs.scenario, archiveTheme || themes)}`,
    '',
    '【案例】（必摘1个）',
    formatLimitedItems(caseItems.slice(0, 1), '本文不强摘案例，保留观点和对策即可。'),
    `适用主题：${themes}`,
    '',
    '【对策四要素】',
    `主体：${cleanText(cm.subject, '党委政府、职能部门、基层组织、社会力量')} 手段：${cleanText(cm.method, '制度规范、技术赋能、宣传引导、监督反馈')} 行动：${cleanText(cm.content, '开展专项治理，建立长效机制')} 目标：${cleanText(cm.purpose, '解决现实问题，提升治理效能')}`
  ].join('\n')
}

function buildPracticeBlock(material) {
  const practice = material.practice || {}
  return [
    ...getPracticeOptions(material.date),
    '',
    '自检标准：□有明确主体 □有具体动作 □有规范表达',
    '',
    `今日必背：「${cleanText(practice.mustRemember, '今日保留一个规范表达即可。')}」`,
    '',
    '明日衔接：明天补一个同主题______（案例/金句/规范词）'
  ].join('\n')
}

function buildCopyText(draft) {
  const material = draft || {}
  const date = material.date || getPreviousDate(getTodayChinaDate())
  const dateLabel = material.sourceDateLabel || formatChineseDate(date)
  const article = material.dailyArticle ? normalizeReadingArticle(material.dailyArticle) : null
  const separator = '─────────────────'
  const sections = [
    `【日期】${dateLabel} 申论/面试精读`,
    article && article.url ? `原文链接｜${article.url}` : '',
    '',
    separator,
    '',
    '📌 今日选文',
    material.dailyArticle ? buildSelectionBlock(material) : '今日没有通过时效校验的可用文章，暂不生成精读稿。',
    '',
    separator,
    '',
    '🧭 骨架拆解',
    buildFrameworkBlock(material),
    '',
    separator,
    '',
    '🧩 素材工具箱',
    '',
    buildToolboxBlock(material),
    '',
    separator,
    '',
    '📝 10分钟微练（三选一，每天轮换）',
    buildPracticeBlock(material),
    '',
    separator
  ]
  return sections.filter(line => line !== null && line !== undefined).join('\n').trim()
}

function buildPublishMaterial(draft) {
  const date = draft.date || getPreviousDate(getTodayChinaDate())
  const dateLabel = draft.sourceDateLabel || formatChineseDate(date)
  const dailyArticle = draft.dailyArticle ? normalizeReadingArticle(draft.dailyArticle) : null
  const normalizedDraft = {
    ...draft,
    date,
    sourceDateLabel: dateLabel,
    dailyArticle
  }
  const copyText = draft.copyText && !isBadCopyText(draft.copyText)
    ? draft.copyText
    : buildCopyText(normalizedDraft)
  const highlightQuotes = []
  const golden = normalizedDraft.toolbox && normalizedDraft.toolbox.goldenSentence
    || normalizedDraft.expression && normalizedDraft.expression.goldenSentence
  if (golden && golden.text && golden.text !== '无') highlightQuotes.push(golden.text)
  const framework = normalizedDraft.framework || normalizedDraft.argument || {}
  const toolbox = normalizedDraft.toolbox || {
    countermeasure: normalizedDraft.method && normalizedDraft.method.countermeasure || {},
    caseExtraction: normalizedDraft.method && normalizedDraft.method.caseExtraction || '',
    formalWords: normalizedDraft.expression && normalizedDraft.expression.formalWords || [],
    highFrequencyPhrases: [],
    goldenSentences: normalizedDraft.expression && normalizedDraft.expression.goldenSentence
      ? [normalizedDraft.expression.goldenSentence]
      : [],
    goldenSentence: normalizedDraft.expression && normalizedDraft.expression.goldenSentence || {},
    caseMaterials: [],
    themes: normalizedDraft.expression && normalizedDraft.expression.themes || []
  }

  return {
    date,
    title: `${dateLabel} 申论/面试精读`,
    source: '人民网观点频道',
    generatedBy: draft.generatedBy || 'cloud-daily-reading',
    mode: 'daily-reading',
    copyText,
    dailyArticle,
    selectedArticle: dailyArticle,
    selection: normalizedDraft.selection || {},
    framework,
    toolbox,
    argument: {
      centerPoint: framework.centerPoint || '',
      chain: framework.chain || {}
    },
    method: {
      transferStructure: framework.transferStructure || '',
      answerFocus: framework.answerFocus || '',
      countermeasure: toolbox.countermeasure || {},
      caseExtraction: toolbox.caseExtraction || ''
    },
    expression: {
      formalWords: toolbox.formalWords || [],
      highFrequencyPhrases: toolbox.highFrequencyPhrases || [],
      goldenSentence: toolbox.goldenSentence || {},
      themes: toolbox.themes || []
    },
    practice: normalizedDraft.practice || {},
    highlightQuotes,
    top3: []
  }
}

module.exports = {
  MODULE_KEYS,
  asArray,
  cleanText,
  getPreviousDate,
  getTodayChinaDate,
  formatChineseDate,
  buildCopyText,
  buildPublishMaterial,
  buildModuleDraft,
  mergeModuleDrafts,
  validateModuleDraft,
  summarizeFinalDraft,
  validateMaterial,
  isBadCopyText,
  normalizeReadingArticle,
  selectDailyArticle
}
