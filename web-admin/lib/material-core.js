const core = require('../../cloud/functions/generateDailyMaterial/material-core')

function buildGenerationPrompt({ targetDate, articles }) {
  const dateLabel = core.formatChineseDate(targetDate)
  const articleLines = core.asArray(articles).map((article, index) => (
    `${index + 1}. [${article.column || '人民网观点'}] ${article.title}
   发布日期：${article.publishDate || article.originalDate || targetDate}
   链接：${article.url}`
  )).join('\n')

  return `你是一位专业的国考申论和结构化面试备考教研老师。请根据人民网观点频道 ${dateLabel} 发布的文章，只选择一篇最值得继续精读的文章，生成“每日一篇精读稿”。

硬性要求：
1. 只使用下方文章列表，不得引入旧文章、其他日期文章或虚构链接。
2. 只能选择一篇文章，标题、链接、金句、对策必须全部属于该文章。
3. 规范表达必须是结构性概括，禁止简单同义词替换；例如“AI发展不均衡”应升级为“数字鸿沟加剧”或“智能红利分配结构性失衡”，“粮食连年丰收”应升级为“粮食产能高位护盘”或“稳产保供根基夯实”。
4. 避免重复劳动：framework 只讲“结构+使用场景”，toolbox 只存“对策+表达”，practice 只给一项10分钟练习。
5. framework.logicChain 必须是 4-5 个“动词+宾语”短节点，尽量 3-8 个汉字，例如：切评价偏差 → 破唯帽旧弊 → 立实绩标准 → 健分类机制 → 服务人才强国。
6. selection.qualityCheck 只输出“✅ 日期/来源一致”或“⚠️ 日期/来源不一致，注意”。
7. toolbox.highFrequencyPhrases 必须给 3 个高频短语。
8. toolbox 的金句和案例都只保留 1 个最值得背的，不要堆材料。
9. practice 保持“三选一，每天轮换”的轻量练习思路。
10. 输出纯 JSON，不要 Markdown，不要解释。
11. 最终成稿第一行必须对应：【日期】${dateLabel} 申论/面试精读。

文章列表：
${articleLines || '暂无文章。请返回 dailyArticle:null，并在 selection.reason 中说明当天缺少可用同日素材。'}

JSON 字段如下：
{
  "date": "${targetDate}",
  "sourceDateLabel": "${dateLabel}",
  "dailyArticle": {
    "column": "栏目",
    "title": "文章标题",
    "url": "原文链接",
    "originalDate": "${targetDate}",
    "publishDate": "${targetDate}",
    "mainTopic": "核心议题",
    "applicableQuestions": ["分析题", "对策题", "大作文"],
    "structure": {
      "intro": "如何引入",
      "analysis": "如何分析",
      "measure": "如何提出对策",
      "elevation": "如何升华"
    },
    "countermeasure": {
      "subject": "主体",
      "method": "手段",
      "content": "行动",
      "purpose": "目标"
    },
    "formalWords": [
      { "plain": "原文表述", "formal": "结构性申论规范表达" }
    ],
    "highFrequencyPhrases": ["高频短语1", "高频短语2", "高频短语3"],
    "quotes": [
      { "text": "金句原文", "usage": "适用主题或题型" }
    ],
    "caseMaterials": [
      { "fact": "可作为案例的事实/现象", "usage": "适用主题" }
    ],
    "logicChain": ["切现象", "破问题", "立标准", "建机制", "升主题"],
    "corePoint": "中心论点",
    "themes": ["主题1", "主题2"]
  },
  "selection": {
    "reason": "为什么今天选这一篇精读",
    "topic": "核心议题",
    "archiveTheme": "归入哪个主题知识树，如人才发展/数字经济与科技创新/区域协调发展",
    "use": "文章用法：短评表达训练/结构范本/案例素材/主题精读",
    "role": "学习重点：一句话说明今天只沉淀什么，避免重复学习",
    "questions": ["分析题", "对策题", "大作文"],
    "skipped": "未选文章列表或无",
    "qualityCheck": "✅ 日期/来源一致"
  },
  "framework": {
    "centerPoint": "中心论点",
    "transferStructure": "可迁移骨架",
    "answerFocus": "把适用题型和使用场景合并说明",
    "logicChain": ["动宾短语1", "动宾短语2", "动宾短语3", "动宾短语4", "动宾短语5"],
    "chain": {
      "intro": "引入",
      "analysis": "剖析",
      "measure": "施策",
      "elevation": "升华"
    }
  },
  "toolbox": {
    "countermeasure": {
      "subject": "主体",
      "method": "手段",
      "content": "行动",
      "purpose": "目标"
    },
    "caseExtraction": "只说明今日保留哪一组对策/案例/表达，避免堆材料",
    "formalWords": [
      { "plain": "原文表述", "formal": "结构性申论规范表达" }
    ],
    "highFrequencyPhrases": ["高频短语1", "高频短语2", "高频短语3"],
    "goldenSentences": [
      { "text": "必摘金句，只保留1个", "usage": "适用主题" }
    ],
    "goldenSentence": {
      "text": "金句原文",
      "usage": "适用主题"
    },
    "caseMaterials": [
      { "fact": "必摘案例或核心现象，只保留1个", "usage": "适用主题" }
    ],
    "themes": ["主题1", "主题2"]
  },
  "practice": {
    "task": "10分钟内只完成的一项小练习",
    "timeBox": "10分钟",
    "prompt": "一段式作答提示",
    "selfCheck": "一句话自检标准",
    "mustRemember": "今天只背一句或一个规范表达",
    "nextLink": "明日衔接"
  }
}`
}

module.exports = {
  ...core,
  buildGenerationPrompt
}
