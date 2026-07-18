function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function cleanText(value, fallback) {
  const selected = value === undefined || value === null || value === '' ? fallback : value
  if (selected && typeof selected === 'object') return String(fallback || '').trim()
  return String(selected || '').trim()
}

function formatChineseDate(date) {
  const parts = String(date || '').split('-').map(Number)
  if (parts.length !== 3 || !parts[0]) return '202X年X月X日'
  return `${parts[0]}年${parts[1]}月${parts[2]}日`
}

const BAD_COPY_TOKENS = [
  '今日精读文章',
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

function isUsableCopyText(copyText) {
  const source = String(copyText || '').trim()
  if (!source) return false
  if (BAD_COPY_TOKENS.some(token => source.includes(token))) return false
  if (hasRepeatedCopyBlocks(source)) return false
  if (!source.startsWith('【日期】')) return false
  if (!source.includes('原文链接｜http')) return false
  if (!/标题：《[^》]+》/.test(source)) return false
  return ['📌 今日选文', '🧭 骨架拆解', '🧩 素材工具箱', '📝 10分钟微练']
    .every(token => source.includes(token))
}

function hasUsefulStructuredData(data) {
  const article = data && (data.dailyArticle || data.selectedArticle || {})
  const title = cleanText(article.title || data && data.articleTitle, '')
  const url = cleanText(article.url || data && data.articleUrl, '')
  if (!title || !url || title === '今日精读文章' || title === '未命名文章') return false

  const selection = data.selection || {}
  const framework = data.framework || data.argument || {}
  const toolbox = data.toolbox || data.expression || {}
  const practice = data.practice || {}
  const richValues = [
    selection.reason,
    selection.archiveTheme,
    framework.centerPoint,
    framework.transferStructure,
    framework.answerFocus,
    toolbox.goldenSentence && (toolbox.goldenSentence.text || toolbox.goldenSentence.sentence),
    toolbox.formalWords && toolbox.formalWords.length,
    toolbox.highFrequencyPhrases && toolbox.highFrequencyPhrases.length,
    practice.mustRemember,
    article.corePoint,
    article.formalWords && article.formalWords.length,
    article.quotes && article.quotes.length,
    article.caseMaterials && article.caseMaterials.length
  ]
  return richValues.some(Boolean)
}

function isMissingContent(value) {
  const text = cleanText(value, '')
  if (!text || text === '无') return true
  return BAD_COPY_TOKENS.some(token => text.includes(token))
}

function normalizeIdentity(value) {
  return cleanText(value, '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/[\s“”‘’《》【】（）()：:，,。.!！?？\-_/]/g, '')
}

function isWeakStandardWord(original, standard) {
  const plain = cleanText(original, '')
  const formal = cleanText(standard, '')
  const weakWords = ['人工智能发展失衡', '粮食生产连年丰收', '粮食稳产保供根基', '粮食稳产保供', '规范表达待完善']
  if (!formal || weakWords.indexOf(formal) !== -1) return true
  if (normalizeIdentity(plain) === normalizeIdentity(formal)) return true
  if (/根基$/.test(formal) && !/根基夯实$/.test(formal)) return true
  return BAD_COPY_TOKENS.some(token => formal.includes(token) || plain.includes(token))
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

function inferLogicChain(article, archiveTheme) {
  const source = `${cleanText(article && article.title, '')}${cleanText(article && article.mainTopic, '')}${archiveTheme || ''}`
  if (/人才|评价/.test(source)) return ['切评价偏差', '破唯帽旧弊', '立实绩标准', '健分类机制', '服务人才强国']
  if (/算力|数字|科技|AI|人工智能|创新/.test(source)) return ['切算力热潮', '破重建轻用', '优供需匹配', '提调度效能', '支撑数字中国']
  if (/区域|协作|川藏|雅安|地方/.test(source)) return ['切区位变化', '破协作堵点', '强通道联动', '促产业协同', '服务区域协调']
  if (/乡村|农业|粮食|耕地/.test(source)) return ['切稳产需求', '守耕地红线', '强科技支撑', '健保供机制', '夯粮安根基']
  if (/消费|售后|维权/.test(source)) return ['切消费痛点', '破售后乱象', '明平台责任', '畅维权渠道', '护消费信心']
  if (/文化|路牌|城市形象/.test(source)) return ['切出圈现象', '破同质表达', '深挖地方文脉', '规范传播秩序', '涵养城市气质']
  if (/基层|治理|社区|物业|民生/.test(source)) return ['切民生小事', '找治理堵点', '明多元责任', '建闭环机制', '升治理效能']
  return ['切现实议题', '找问题症结', '明主体责任', '建长效机制', '升治理效能']
}

function buildFallbackCaseMaterials(article, archiveTheme) {
  const title = cleanText(article && article.title, '今日文章')
  const topic = cleanText(article && article.mainTopic, archiveTheme || '公共治理')
  const content = cleanText(article && article.countermeasure && article.countermeasure.content, '')
  const core = cleanText(article && article.corePoint, '')
  return [{
    fact: `以《${title}》所涉“${topic}”议题为例，说明${content || core || '治理要坚持问题导向和效果导向'}。`,
    usage: `${archiveTheme || topic}/举例论证`
  }]
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
  ].filter(Boolean)
  return [...new Set(candidates)].slice(0, 3)
}

function formatQuestionChecklist(questions) {
  const includes = pattern => asArray(questions).some(item => pattern.test(cleanText(item, '')))
  const mark = pattern => includes(pattern) ? '☑' : '□'
  return [
    `${mark(/概括/)}概括`,
    `${mark(/分析/)}分析`,
    `${mark(/对策/)}对策`,
    `${mark(/大作文|分论点/)}大作文分论点`,
    `${mark(/面试|综合分析/)}面试综合分析`
  ].join(' ')
}

function getPracticeOptions(date) {
  const options = [
    'A. 用100字概括本文',
    'B. 用“主体+手段+行动+目标”写一条对策',
    'C. 仿写一个分论点'
  ]
  const day = Number(String(date || '').split('-')[2] || 1)
  const selected = Number.isFinite(day) ? (day - 1) % options.length : 0
  return options.map((text, index) => `${index === selected ? '☑' : '□'} ${text}`)
}

function normalizeDailyArticle(material) {
  const data = material || {}
  const indexedArticle = data.articleTitle || data.articleUrl ? {
    title: data.articleTitle,
    url: data.articleUrl,
    column: data.articleColumn
  } : {}
  const article = data.dailyArticle || data.selectedArticle || indexedArticle || {}
  const framework = data.framework || data.argument || {}
  const toolbox = data.toolbox || {}
  const expression = data.expression || {}
  const method = data.method || {}
  const formalWords = asArray(article.formalWords || toolbox.formalWords || expression.formalWords)
  const quotes = asArray(article.quotes)
  const golden = toolbox.goldenSentence || expression.goldenSentence || {}

  return {
    column: cleanText(article.column, '人民网观点'),
    title: cleanText(article.title, ''),
    originalDate: cleanText(article.originalDate || article.publishDate || data.date, ''),
    url: cleanText(article.url, ''),
    mainTopic: cleanText(article.mainTopic || (data.selection && data.selection.topic), '公共治理'),
    applicableQuestions: asArray(article.applicableQuestions || (data.selection && data.selection.questions)),
    structure: article.structure || framework.chain || {},
    logicChain: normalizeLogicChain(article.logicChain || framework.logicChain),
    countermeasure: article.countermeasure || method.countermeasure || {},
    formalWords,
    highFrequencyPhrases: normalizePhrases(article.highFrequencyPhrases || toolbox.highFrequencyPhrases),
    quotes: quotes.length ? quotes : [{ text: golden.text, usage: golden.usage }],
    caseMaterials: asArray(article.caseMaterials || toolbox.caseMaterials).map(normalizeCaseMaterial).filter(item => item.fact),
    corePoint: cleanText(article.corePoint || framework.centerPoint, '围绕中心议题展开论证，体现问题导向与实践导向。'),
    themes: asArray(article.themes || toolbox.themes || expression.themes)
  }
}

function buildCopyText(material) {
  const data = material || {}
  if (data.copyText && isUsableCopyText(data.copyText)) return data.copyText
  if (!hasUsefulStructuredData(data)) return ''

  const dateLabel = data.sourceDateLabel || formatChineseDate(data.date)
  const article = normalizeDailyArticle(data)
  const selection = data.selection || {}
  const framework = data.framework || data.argument || {}
  const chain = framework.chain || article.structure || {}
  const logicChain = normalizeLogicChain(framework.logicChain || article.logicChain).length
    ? normalizeLogicChain(framework.logicChain || article.logicChain)
    : inferLogicChain(article, cleanText(selection.archiveTheme, article.mainTopic))
  const toolbox = data.toolbox || {}
  const method = data.method || {}
  const countermeasure = toolbox.countermeasure || method.countermeasure || article.countermeasure || {}
  const expression = data.expression || {}
  const archiveTheme = cleanText(selection.archiveTheme, article.mainTopic)
  const rawFormal = asArray(toolbox.formalWords || expression.formalWords || article.formalWords)[0] || {}
  const inferredFormal = inferFormalPair(article, archiveTheme)
  const formal = isWeakStandardWord(rawFormal.plain, rawFormal.formal) ? inferredFormal : rawFormal
  const phrases = normalizePhrases(toolbox.highFrequencyPhrases || article.highFrequencyPhrases).length
    ? normalizePhrases(toolbox.highFrequencyPhrases || article.highFrequencyPhrases)
    : buildHighFrequencyPhrases(article, archiveTheme)
  const golden = toolbox.goldenSentence || expression.goldenSentence || asArray(article.quotes)[0] || {}
  const goldenItems = asArray(toolbox.goldenSentences).length
    ? asArray(toolbox.goldenSentences)
    : (asArray(article.quotes).filter(item => !isMissingContent(item && (item.text || item.quote))).length
      ? asArray(article.quotes).filter(item => !isMissingContent(item && (item.text || item.quote)))
      : [{ text: cleanText(golden.text || golden.sentence, cleanText(formal.formal, inferredFormal.formal)), usage: cleanText(golden.usage || golden.scene, archiveTheme) }])
  const caseItems = asArray(toolbox.caseMaterials || article.caseMaterials).length
    ? asArray(toolbox.caseMaterials || article.caseMaterials).map(normalizeCaseMaterial)
    : buildFallbackCaseMaterials(article, cleanText(selection.archiveTheme, article.mainTopic))
  const themes = asArray(toolbox.themes || expression.themes || article.themes)
  const practice = data.practice || {}
  const questions = asArray(selection.questions).length ? asArray(selection.questions) : article.applicableQuestions
  const themeLabels = themes.length ? themes.map(item => `#${item}`).join(' ') : '#公共治理'
  const separator = '─────────────────'

  return [
    `【日期】${dateLabel} 申论/面试精读`,
    article.url ? `原文链接｜${article.url}` : '',
    '',
    separator,
    '',
    '📌 今日选文',
    `标题：《${article.title}》`,
    `来源：${article.column}`,
    `母题归档：${cleanText(selection.archiveTheme, article.mainTopic)}知识树`,
    `选择理由：${limitChineseText(selection.reason, 30)}`,
    `日期校验：${cleanText(selection.qualityCheck, '✅')}`,
    '',
    separator,
    '',
    '🧭 骨架拆解',
    `总论点：${cleanText(framework.centerPoint, article.corePoint)}`,
    '',
    '论证短链（5节点）：',
    logicChain.join(' → '),
    '',
    `可迁移骨架：${cleanText(framework.transferStructure || method.transferStructure, '现象切入 - 问题剖析 - 机制施策 - 价值升华')}`,
    '',
    '适用题型（勾选）：',
    formatQuestionChecklist(questions),
    '',
    separator,
    '',
    '🧩 素材工具箱',
    '',
    '【规范词替换】',
    `原：${cleanText(formal.plain, inferredFormal.plain)} → 申论：${cleanText(formal.formal, inferredFormal.formal)}`,
    '',
    '【高频短语】（3个）',
    ...phrases.map(item => `- ${item}`),
    '',
    '【金句】（必摘1句）',
    `「${formatLimitedItems(goldenItems.slice(0, 1), cleanText(formal.formal, inferredFormal.formal))}」`,
    `适用场景：${cleanText(golden.usage || golden.scene, archiveTheme || article.mainTopic)}`,
    '',
    '【案例】（必摘1个）',
    formatLimitedItems(caseItems.slice(0, 1), '本文不强摘案例，保留观点和对策即可。'),
    `适用主题：${themeLabels}`,
    '',
    '【对策四要素】',
    `主体：${cleanText(countermeasure.subject, '党委政府、职能部门、基层组织、社会力量')} 手段：${cleanText(countermeasure.method, '制度规范、技术赋能、宣传引导、监督反馈')} 行动：${cleanText(countermeasure.content, '开展专项治理，建立长效机制')} 目标：${cleanText(countermeasure.purpose, '解决现实问题，提升治理效能')}`,
    '',
    separator,
    '',
    '📝 10分钟微练（三选一，每天轮换）',
    ...getPracticeOptions(data.date),
    '',
    '自检标准：□有明确主体 □有具体动作 □有规范表达',
    '',
    `今日必背：「${cleanText(practice.mustRemember, cleanText(golden.text || formal.formal, inferredFormal.formal))}」`,
    '',
    '明日衔接：明天补一个同主题______（案例/金句/规范词）',
    '',
    separator
  ].filter(line => line !== null && line !== undefined && line !== false).join('\n').trim()
}

const COPY_SECTION_DEFINITIONS = [
  { key: 'selection', code: '选', label: '今日选文', title: '为什么读这篇', pattern: /^[📌#*\s]*今日选文/ },
  { key: 'framework', code: '骨', label: '骨架拆解', title: '结构与场景合并看', pattern: /^[🧭#*\s]*(骨架拆解|论证拆解)/ },
  { key: 'toolbox', code: '材', label: '素材工具箱', title: '对策与表达一起存', pattern: /^(?:[🧩#*\s]*(?:素材工具箱|方法迁移)|[✍️#*\s]*表达积累)\s*$/ },
  { key: 'practice', code: '练', label: '10分钟微练', title: '今天只写一小段', pattern: /^[📝#*\s]*(10分钟微练(?:（三选一，每天轮换）)?|今日练习)/ }
]

function extractArticleUrls(sectionText) {
  const links = []
  const seen = new Set()
  let currentTitle = ''

  String(sectionText || '').split('\n').forEach(line => {
    const titleMatch = line.match(/(?:文章标题|标题)[：:｜]\s*《([^》]+)》/) || line.match(/《([^》]+)》/)
    if (titleMatch) currentTitle = titleMatch[1].trim()

    const matches = line.match(/https?:\/\/[^\s\]】）》"']+/g) || []
    matches.forEach(rawUrl => {
      const url = rawUrl.replace(/[，。；;,.]+$/, '')
      if (!url || seen.has(url)) return
      seen.add(url)
      links.push({
        title: currentTitle || `文章${links.length + 1}`,
        url
      })
    })
  })

  return links
}

function finalizeCopySection(section, globalUrls) {
  const text = section.lines.join('\n').trim()
  const contentLines = section.lines.slice(1).map((line, index) => {
    if (!line.trim()) return { id: `line-${index}`, type: 'spacer' }
    const urlMatch = line.match(/https?:\/\/[^\s\]】）》"']+/)
    if (!urlMatch) {
      const trimmed = line.trim()
      const fieldMatch = trimmed.match(/^(标题|来源|文章标题|发布日期|日期校验|选择理由|核心议题|文章用法|母题归档|素材定位|学习重点|适用题型|今日不读|备选不读|总论点|中心论点|论证短链|可迁移结构|可迁移骨架|使用场景|适用场景|主体|手段|行动|目标|答题落点|素材提取|原表达|规范表达|金句|金句（必摘1个，最多2个）|案例（必摘1个，最多2个）|适用主题|主题标签|题目|用时|只练一项|今日轮换|作答提示|复盘问题|自检标准|今天必背|今日必背|明日衔接|引题|分析|对策|升华|引入|剖析|施策|目的|内容|场景|关联旧知)[：:｜]\s*(.*)$/)

      if (/^(论证链|论证短链（5节点）|适用题型（勾选）|四步拆解|对策模型|表达积累)[：:]?$/.test(trimmed) || /^【.+】/.test(trimmed) || /^▶\s*/.test(trimmed)) {
        return { id: `line-${index}`, type: 'heading', text: trimmed.replace(/^▶\s*/, '') }
      }
      if (/^(文章标题|标题)/.test(trimmed) || /^《[^》]+》/.test(trimmed)) {
        return { id: `line-${index}`, type: 'article', text: trimmed }
      }
      if (/^来源[：:｜]/.test(trimmed)) {
        return { id: `line-${index}`, type: 'source', text: trimmed }
      }
      if (fieldMatch) {
        return {
          id: `line-${index}`,
          type: 'field',
          label: fieldMatch[1],
          value: fieldMatch[2]
        }
      }
      return { id: `line-${index}`, type: 'text', text: line }
    }
    const url = urlMatch[0].replace(/[，。；;,.]+$/, '')
    const start = line.indexOf(urlMatch[0])
    return {
      id: `line-${index}`,
      type: 'url',
      prefix: line.slice(0, start),
      url,
      suffix: line.slice(start + urlMatch[0].length)
    }
  })

  const urls = extractArticleUrls(text)
  return {
    key: section.key,
    code: section.code,
    label: section.label,
    title: section.title,
    text,
    urls: urls.length ? urls : asArray(globalUrls),
    contentLines
  }
}

function splitCopySections(copyText) {
  const lines = String(copyText || '').replace(/\r\n/g, '\n').split('\n')
  const sections = []
  let current = null
  const globalUrls = extractArticleUrls(copyText)

  lines.forEach(line => {
    const trimmed = line.trim()
    const definition = COPY_SECTION_DEFINITIONS.find(item => item.pattern.test(trimmed))

    if (definition) {
      if (current) sections.push(finalizeCopySection(current, globalUrls))
      current = { ...definition, lines: [line] }
      return
    }

    if (current && !/^[=─-]{6,}$/.test(trimmed)) current.lines.push(line)
  })

  if (current) sections.push(finalizeCopySection(current, globalUrls))
  return sections.filter(item => item.text)
}

module.exports = {
  buildCopyText,
  isUsableCopyText,
  splitCopySections
}
