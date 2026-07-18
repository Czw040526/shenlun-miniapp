const assert = require('assert')

const {
  MODULE_KEYS,
  buildCopyText,
  buildPublishMaterial,
  buildModuleDraft,
  mergeModuleDrafts,
  summarizeFinalDraft,
  validateModuleDraft,
  validateMaterial,
  isBadCopyText
} = require('../../cloud/functions/generateDailyMaterial/material-core')
const {
  buildCopyText: buildLocalCopyText,
  splitCopySections,
  isUsableCopyText
} = require('../../miniprogram/utils/materialFormatter')

const targetDate = '2026-07-17'
const sourceArticles = [
  {
    id: 'yaan',
    priority: 1,
    column: '人民锐评',
    title: '行进中国丨壹时评：从“地理起点”到“发展支点”，雅安融入川藏协作新格局',
    url: 'http://opinion.people.com.cn/n1/2026/0717/c223228-40762359.html',
    publishDate: targetDate,
    originalDate: targetDate
  },
  {
    id: 'talent',
    priority: 1,
    column: '今日谈',
    title: '人才评价须唯“实”（评论员观察）',
    url: 'http://opinion.people.com.cn/n1/2026/0717/c461529-40762244.html',
    publishDate: targetDate,
    originalDate: targetDate
  },
  {
    id: 'compute',
    priority: 1,
    column: '今日谈',
    title: '谋算力也应提效能（人民时评）',
    url: 'http://opinion.people.com.cn/n1/2026/0717/c461529-40762245.html',
    publishDate: targetDate,
    originalDate: targetDate
  }
]

function summaryFor(article, fields) {
  return {
    ...article,
    applicableQuestions: ['分析题', '对策题', '大作文'],
    mainTopic: fields.topic,
    structure: {
      intro: fields.intro,
      analysis: fields.analysis,
      measure: fields.measure,
      elevation: fields.elevation
    },
    countermeasure: {
      subject: fields.subject,
      method: fields.method,
      content: fields.content,
      purpose: fields.purpose
    },
    logicChain: fields.logicChain,
    formalWords: [{ plain: fields.plain, formal: fields.formal }],
    highFrequencyPhrases: fields.phrases,
    quotes: [{ text: fields.quote, usage: fields.scene }],
    caseMaterials: [{ fact: fields.caseFact, usage: fields.scene }],
    corePoint: fields.corePoint,
    themes: [fields.topic, fields.scene]
  }
}

const summaries = [
  summaryFor(sourceArticles[0], {
    topic: '区域协作',
    intro: '由雅安区位变化切入区域协作议题。',
    analysis: '地理节点转化为发展支点，需要产业、交通、生态协同。',
    measure: '加强跨区域基础设施和产业协同。',
    elevation: '服务区域协调发展格局。',
    subject: '地方政府、行业部门、市场主体',
    method: '规划协同+产业联动',
    content: '完善通道建设和产业合作机制',
    purpose: '提升区域协作发展能级',
    plain: '地方之间要多配合',
    formal: '区域协同发展格局',
    quote: '把区位优势转化为发展胜势。',
    caseFact: '雅安以区位协作推动通道建设和产业联动。',
    logicChain: ['切区位变化', '破协作堵点', '强通道联动', '促产业协同', '服务区域协调'],
    phrases: ['区域协同', '产业联动', '发展支点'],
    scene: '区域发展',
    corePoint: '区域协作要把地理优势转化为发展动能。'
  }),
  summaryFor(sourceArticles[1], {
    topic: '人才评价',
    intro: '由唯帽子、唯论文等评价偏差切入。',
    analysis: '评价导向影响人才成长、创新生态和事业发展。',
    measure: '完善分类评价、实绩考核和长期跟踪机制。',
    elevation: '服务人才强国和高质量发展。',
    subject: '组织人事部门、用人单位、行业主管部门',
    method: '分类评价+实绩考核+长期跟踪',
    content: '健全以创新价值、能力贡献为导向的人才评价机制',
    purpose: '破除形式化评价，激发人才创造活力',
    plain: '看人不能只看头衔',
    formal: '实绩导向评价体系',
    quote: '人才评价的尺子准了，干事创业的方向才会更明。',
    caseFact: '人才评价改革从头衔论文转向能力贡献和实际业绩。',
    logicChain: ['切评价偏差', '破唯帽旧弊', '立实绩标准', '健分类机制', '服务人才强国'],
    phrases: ['实绩导向', '分类评价', '人才活力'],
    scene: '人才发展',
    corePoint: '只有把评价落到实绩上，才能让人才活力充分涌流。'
  }),
  summaryFor(sourceArticles[2], {
    topic: '算力效能',
    intro: '由算力建设热切入效能议题。',
    analysis: '算力发展不能只看规模，还要看利用效率和应用转化。',
    measure: '优化算力调度，推动供需匹配和绿色集约发展。',
    elevation: '以高效算力支撑数字中国建设。',
    subject: '发改、工信部门和平台企业',
    method: '统筹布局+供需匹配+绿色调度',
    content: '建设算力调度平台，提升资源利用率',
    purpose: '让数字基础设施更好服务实体经济',
    plain: '算力不能只追求建得多',
    formal: '算力供给效能跃升',
    quote: '数字底座越坚实，发展动能越澎湃。',
    caseFact: '算力建设从重规模转向重效能、重调度、重转化。',
    logicChain: ['切算力热潮', '破重建轻用', '优供需匹配', '提调度效能', '支撑数字中国'],
    phrases: ['算力效能', '供需匹配', '绿色调度'],
    scene: '数字经济',
    corePoint: '谋算力更要重效能，才能释放数字经济新动能。'
  })
]

const draft = summarizeFinalDraft(summaries, targetDate, sourceArticles)
assert.strictEqual(draft.dailyArticle.title, sourceArticles[1].title)

const material = buildPublishMaterial(draft)
const validation = validateMaterial(material, targetDate, sourceArticles)
assert.strictEqual(validation.valid, true, validation.errors.join('；'))
assert.strictEqual(material.mode, 'daily-reading')
assert.strictEqual(material.dailyArticle.title, sourceArticles[1].title)
assert(material.copyText.includes('📌 今日选文'))
assert(material.copyText.includes('标题：《人才评价须唯“实”（评论员观察）》'))
assert(material.copyText.includes('母题归档：人才发展知识树'))
assert(material.copyText.includes('日期校验：✅ 日期/来源一致'))
assert(material.copyText.includes('🧭 骨架拆解'))
assert(material.copyText.includes('🧩 素材工具箱'))
assert(material.copyText.includes('📝 10分钟微练'))
assert(material.copyText.includes('人才评价的尺子准了'))
assert(material.copyText.includes('论证短链（5节点）：\n切评价偏差 → 破唯帽旧弊 → 立实绩标准 → 健分类机制 → 服务人才强国'))
assert(material.copyText.includes('【高频短语】（3个）'))
assert(material.copyText.includes('- 实绩导向'))
assert(material.copyText.includes('【金句】（必摘1句）'))
assert(material.copyText.includes('【案例】（必摘1个）'))
assert(material.copyText.includes('人才评价改革从头衔论文转向能力贡献和实际业绩。'))
assert(material.copyText.includes('☑ B. 用“主体+手段+行动+目标”写一条对策'))
assert(!material.copyText.includes('链接日期、页面发布日期'))
assert(!material.copyText.includes('[x]'))
assert(!material.copyText.includes('[ ]'))
assert.strictEqual(buildLocalCopyText(material), material.copyText)

const { copyText, ...materialWithoutCopyText } = material
assert.strictEqual(buildLocalCopyText(materialWithoutCopyText), copyText)

const badStoredCopyText = `【日期】2026年7月17日 申论/面试精读
原文链接｜${sourceArticles[1].url}

─────────────────

📌 今日选文
标题：《今日精读文章》
来源：人民网观点
母题归档：公共治理知识树
选择理由：
日期校验：✅

─────────────────

🧩 素材工具箱

【规范词替换】
原：原文表达待提取 → 申论：规范表达待完善

【高频短语】（3个）
- 公共治理效能提升
- 问题导向
- 长效机制`
assert.strictEqual(isUsableCopyText(badStoredCopyText), false)
assert.strictEqual(isBadCopyText(badStoredCopyText), true)
assert.strictEqual(buildLocalCopyText({ ...material, copyText: badStoredCopyText }), material.copyText)

const repeatedToolboxCopyText = material.copyText.replace(
  '【案例】（必摘1个）',
  '【规范词替换】\n原：多做事 → 申论：实干导向落实\n\n【案例】（必摘1个）'
)
assert.strictEqual(isUsableCopyText(repeatedToolboxCopyText), false)
assert.strictEqual(isBadCopyText(repeatedToolboxCopyText), true)
const repeatedValidation = validateMaterial({ ...material, copyText: repeatedToolboxCopyText }, targetDate, sourceArticles)
assert.strictEqual(repeatedValidation.valid, false)
assert(repeatedValidation.errors.some(error => error.includes('占位符') || error.includes('重复模块')))

const copySections = splitCopySections(copyText)
assert.deepStrictEqual(
  copySections.map(section => section.key),
  ['selection', 'framework', 'toolbox', 'practice']
)
copySections.forEach(section => {
  assert(section.urls.some(item => item.url === sourceArticles[1].url), `${section.key} 缺少文章网址`)
})
assert(copySections[0].contentLines.some(line => line.type === 'field' && line.label === '母题归档'))
assert(copySections[1].contentLines.some(line => line.type === 'field' && line.label === '总论点'))
assert(copySections[1].contentLines.some(line => line.type === 'heading' && line.text.includes('论证短链')))
assert(copySections[1].contentLines.some(line => line.type === 'heading' && line.text.includes('适用题型')))
assert(copySections[2].contentLines.some(line => line.type === 'heading' && line.text.includes('规范词替换')))
assert(copySections[2].contentLines.some(line => line.type === 'heading' && line.text.includes('高频短语')))
assert(copySections[2].contentLines.some(line => line.type === 'heading' && line.text.includes('金句')))
assert(copySections[2].contentLines.some(line => line.type === 'heading' && line.text.includes('案例')))
assert(copySections[2].contentLines.some(line => line.type === 'heading' && line.text.includes('对策四要素')))
assert.strictEqual(copySections[3].code, '练')

const moduleDrafts = {}
MODULE_KEYS.forEach(moduleKey => {
  const moduleDraft = buildModuleDraft(moduleKey, summaries, targetDate, sourceArticles)
  const moduleValidation = validateModuleDraft(moduleKey, moduleDraft, targetDate, sourceArticles, moduleDrafts)
  assert.strictEqual(moduleValidation.valid, true, `${moduleKey}: ${moduleValidation.errors.join('；')}`)
  moduleDrafts[moduleKey] = moduleDraft
})

const mergedDraft = mergeModuleDrafts(moduleDrafts, targetDate)
assert.strictEqual(mergedDraft.dailyArticle.title, sourceArticles[1].title)
assert(mergedDraft.selection.reason)
assert(mergedDraft.framework.centerPoint)
assert(mergedDraft.framework.answerFocus)
assert(mergedDraft.toolbox.goldenSentence.text)
assert(mergedDraft.practice.task)

const weakMaterial = {
  ...material,
  toolbox: {
    ...material.toolbox,
    formalWords: [{ plain: '粮食年年丰收', formal: '粮食生产连年丰收' }]
  }
}
const weakValidation = validateMaterial(weakMaterial, targetDate, sourceArticles)
assert.strictEqual(weakValidation.valid, false)
assert(weakValidation.errors.some(error => error.includes('规范词未升级')))

const staleMaterial = {
  ...material,
  dailyArticle: {
    ...material.dailyArticle,
    url: 'http://opinion.people.com.cn/n1/2021/0722/c461529-40762244.html',
    originalDate: '2021-07-22'
  }
}
const staleValidation = validateMaterial(staleMaterial, targetDate, sourceArticles)
assert.strictEqual(staleValidation.valid, false)
assert(staleValidation.errors.some(error => error.includes('链接日期不是')))

console.log('PASS generation-quality')
