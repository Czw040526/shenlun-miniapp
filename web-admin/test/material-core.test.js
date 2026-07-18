const assert = require('assert')

const {
  getPreviousDate,
  formatChineseDate,
  buildGenerationPrompt,
  buildCopyText,
  buildPublishMaterial
} = require('../lib/material-core')

const sampleDraft = {
  date: '2026-07-17',
  sourceDateLabel: '2026年7月17日',
  dailyArticle: {
    column: '今日谈',
    title: '人才评价须唯“实”（评论员观察）',
    url: 'http://opinion.people.com.cn/n1/2026/0717/c461529-40762244.html',
    originalDate: '2026-07-17',
    publishDate: '2026-07-17',
    mainTopic: '人才评价',
    applicableQuestions: ['分析题', '对策题', '大作文'],
    structure: {
      intro: '由人才评价中的唯帽子、唯论文倾向切入。',
      analysis: '从评价导向、用人机制、创新生态维度展开分析。',
      measure: '以实绩贡献、岗位需求和长期价值完善评价体系。',
      elevation: '服务高质量发展和人才强国建设。'
    },
    countermeasure: {
      subject: '组织人事部门、用人单位、行业主管部门',
      method: '分类评价+实绩考核+长期跟踪',
      content: '健全以创新价值、能力贡献为导向的人才评价机制',
      purpose: '破除形式化评价，激发人才创造活力'
    },
    formalWords: [
      { plain: '看人不能只看头衔', formal: '实绩导向评价体系' }
    ],
    highFrequencyPhrases: ['实绩导向', '分类评价', '人才活力'],
    quotes: [
      { text: '人才评价的尺子准了，干事创业的方向才会更明。', usage: '人才发展/作风建设' }
    ],
    caseMaterials: [
      { fact: '以人才评价改革为例，说明评价标准要从头衔论文转向能力贡献。', usage: '人才发展/举例论证' }
    ],
    logicChain: ['切评价偏差', '破唯帽旧弊', '立实绩标准', '健分类机制', '服务人才强国'],
    corePoint: '只有把评价落到实绩上，才能让人才活力充分涌流。',
    themes: ['人才评价', '高质量发展']
  },
  selection: {
    reason: '人才评价主题迁移性强，适合分析题、对策题和大作文。',
    topic: '人才评价',
    archiveTheme: '人才发展',
    use: '结构范本',
    role: '今天只沉淀一套人才评价论证骨架、一组对策表达和一个10分钟微练。',
    questions: ['分析题', '对策题', '大作文'],
    skipped: '无',
    qualityCheck: '✅ 日期/来源一致'
  },
  framework: {
    centerPoint: '只有把评价落到实绩上，才能让人才活力充分涌流。',
    transferStructure: '现象切入 - 问题剖析 - 机制施策 - 价值升华',
    answerFocus: '适用于分析题、对策题、大作文。',
    logicChain: ['切评价偏差', '破唯帽旧弊', '立实绩标准', '健分类机制', '服务人才强国'],
    chain: {
      intro: '由人才评价中的唯帽子、唯论文倾向切入。',
      analysis: '从评价导向、用人机制、创新生态维度展开分析。',
      measure: '以实绩贡献、岗位需求和长期价值完善评价体系。',
      elevation: '服务高质量发展和人才强国建设。'
    }
  },
  toolbox: {
    countermeasure: {
      subject: '组织人事部门、用人单位、行业主管部门',
      method: '分类评价+实绩考核+长期跟踪',
      content: '健全以创新价值、能力贡献为导向的人才评价机制',
      purpose: '破除形式化评价，激发人才创造活力'
    },
    caseExtraction: '金句和案例各保留1个，避免贪多。',
    formalWords: [
      { plain: '看人不能只看头衔', formal: '实绩导向评价体系' }
    ],
    highFrequencyPhrases: ['实绩导向', '分类评价', '人才活力'],
    goldenSentences: [
      { text: '人才评价的尺子准了，干事创业的方向才会更明。', usage: '人才发展/作风建设' }
    ],
    goldenSentence: {
      text: '人才评价的尺子准了，干事创业的方向才会更明。',
      usage: '人才发展/作风建设'
    },
    caseMaterials: [
      { fact: '以人才评价改革为例，说明评价标准要从头衔论文转向能力贡献。', usage: '人才发展/举例论证' }
    ],
    themes: ['人才评价', '高质量发展']
  },
  practice: {
    task: '用120字以内回答：如何完善人才评价机制？',
    timeBox: '10分钟',
    prompt: '只写一段：先点出问题或意义，再写1条“主体+手段+行动+目标”的对策。',
    selfCheck: '有明确主体，有具体动作，有规范表达。',
    mustRemember: '人才评价的尺子准了，干事创业的方向才会更明。',
    nextLink: '明天只补一个人才发展案例或表达。'
  }
}

assert.strictEqual(getPreviousDate('2026-07-18'), '2026-07-17')
assert.strictEqual(formatChineseDate('2026-07-17'), '2026年7月17日')

const prompt = buildGenerationPrompt({
  targetDate: '2026-07-17',
  articles: [sampleDraft.dailyArticle]
})

assert(prompt.includes('每日一篇精读稿'))
assert(prompt.includes('【日期】2026年7月17日 申论/面试精读'))
assert(prompt.includes('dailyArticle'))
assert(prompt.includes('framework'))
assert(prompt.includes('toolbox'))
assert(prompt.includes('logicChain'))
assert(prompt.includes('highFrequencyPhrases'))
assert(prompt.includes('人才评价须唯“实”'))

const copyText = buildCopyText(sampleDraft)
assert(copyText.startsWith('【日期】2026年7月17日 申论/面试精读'))
assert(copyText.includes('📌 今日选文'))
assert(copyText.includes('🧭 骨架拆解'))
assert(copyText.includes('🧩 素材工具箱'))
assert(copyText.includes('📝 10分钟微练'))
assert(copyText.includes('原文链接｜http://opinion.people.com.cn/n1/2026/0717/c461529-40762244.html'))
assert(copyText.includes('─────────────────'))
assert(copyText.includes('日期校验：✅ 日期/来源一致'))
assert(copyText.includes('总论点：只有把评价落到实绩上'))
assert(copyText.includes('论证短链（5节点）：\n切评价偏差 → 破唯帽旧弊 → 立实绩标准 → 健分类机制 → 服务人才强国'))
assert(copyText.includes('【高频短语】（3个）'))
assert(copyText.includes('- 实绩导向'))
assert(copyText.includes('原：看人不能只看头衔 → 申论：实绩导向评价体系'))
assert(copyText.includes('【金句】（必摘1句）'))
assert(copyText.includes('「人才评价的尺子准了'))
assert(copyText.includes('【案例】（必摘1个）'))
assert(copyText.includes('以人才评价改革为例'))
assert(copyText.includes('☑ B. 用“主体+手段+行动+目标”写一条对策'))
assert(!copyText.includes('链接日期、页面发布日期'))
assert(!copyText.includes('✍️ 表达积累'))
assert(!copyText.includes('[x]'))
assert(!copyText.includes('[ ]'))

const material = buildPublishMaterial(sampleDraft)
assert.strictEqual(material.date, '2026-07-17')
assert.strictEqual(material.title, '2026年7月17日 申论/面试精读')
assert.strictEqual(material.mode, 'daily-reading')
assert.strictEqual(material.dailyArticle.title, sampleDraft.dailyArticle.title)
assert.strictEqual(material.copyText, copyText)
assert.strictEqual(material.mode, 'daily-reading')
assert.strictEqual(material.toolbox.goldenSentence.text, sampleDraft.toolbox.goldenSentence.text)

console.log('PASS material-core')
