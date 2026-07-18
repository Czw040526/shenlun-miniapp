// 云函数：调用 DeepSeek API
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

const SYSTEM_PROMPT = `你是一位资深申论教研专家，擅长将新闻时评精加工为申论/面试备考素材。

请分析以下人民网文章，严格按照下方JSON Schema输出结果。不允许添加任何额外字段，不允许使用Markdown代码块包裹，只输出纯JSON。

=== JSON Schema ===
{
  "title": "文章原标题（字符串）",
  "publishDate": "文章实际发布日期（格式：YYYY-MM-DD，若无法提取则填null）",
  "mainTopic": "文章核心话题（10字以内的字符串）",
  "logicChain": [
    "论证短链节点1（3-8字，必须是动词+宾语，如'切评价偏差'）",
    "论证短链节点2（3-8字，必须是动词+宾语）",
    "论证短链节点3（3-8字，必须是动词+宾语）",
    "论证短链节点4（3-8字，必须是动词+宾语）",
    "论证短链节点5（3-8字，必须是动词+宾语）"
  ],
  "structure": {
    "intro": "开头如何引入主题（30字以内）",
    "analysis": "分析了哪些维度的问题（分点，用分号分隔，60字以内）",
    "countermeasures": "提出了哪些具体对策（分点，用分号分隔，60字以内）",
    "conclusion": "结尾升华方向（30字以内）"
  },
  "countermeasuresDetail": {
    "subject": "对策主体（如：各级政府/国际组织/农业部门，字符串）",
    "means": "手段（如：政策引导+技术共享，字符串）",
    "content": "具体内容（50字以内）",
    "purpose": "目的（30字以内）"
  },
  "standardWords": {
    "original": "原文中的大白话表述（字符串）",
    "standard": "升级后的申论规范词（必须为四字格或六字格短语，如'数字鸿沟加剧''智能红利结构性失衡'）"
  },
  "highFrequencyPhrases": [
    "高频短语1（4-10字）",
    "高频短语2（4-10字）",
    "高频短语3（4-10字）"
  ],
  "goldenSentence": {
    "sentence": "金句原文（若全文无金句则填null）",
    "scenario": "适用场景（如：科技伦理/公平正义/粮食安全，若无可填null）"
  },
  "caseMaterial": {
    "fact": "最值得保留的事实/案例/现象（若没有具体案例，可填本文讨论的核心现象）",
    "usage": "适用场景（如：人才发展/基层治理/科技创新）"
  }
}

=== 规范词升级规则（强制） ===
严禁简单同义词替换。规范表达必须揭示现象背后的结构性问题、治理机制、能力状态或发展趋势，不能只把原词换一种说法，也不能以“根基”二字草率收尾。
以下为正确示例：
- "AI发展不均衡" → "数字鸿沟加剧" / "智能红利分配结构性失衡"
- "粮食连年丰收" → "粮食产能高位护盘" / "稳产保供根基夯实"
- "跟风模仿" → "文化表达同质化" / "城市形象趋同化"

以下结果一律判为不合格，禁止输出：
- "粮食连年丰收" → "粮食生产连年丰收"
- "粮食连年丰收" → "粮食稳产保供根基"
- "AI发展不均衡" → "人工智能发展失衡"

输出前必须自行核对：标题、发布日期、结构拆解、对策和金句必须全部属于当前这一篇文章，不得引用其他文章内容。

=== 论证短链规则（强制） ===
logicChain 必须是 4-5 个节点，每个节点尽量 3-8 个汉字，采用“动词+宾语”写法，不能写成空泛名词。
正确示例：切评价偏差 → 破唯帽旧弊 → 立实绩标准 → 健分类机制 → 服务人才强国
错误示例：人才评价问题 → 对策 → 发展

=== 输出要求 ===
1. 只输出纯JSON，不要有任何解释性文字
2. 所有字段必须按Schema填写，不允许省略
3. 如果文章中确实没有金句，goldenSentence.sentence填null
4. standardWords.standard不得与standardWords.original构成简单同义改写`

exports.main = async (event) => {
  const {
    model = 'deepseek-chat',
    maxTokens = 4096,
    temperature = 0.7,
    systemPrompt = SYSTEM_PROMPT
  } = event
  const articleContent = event.articleContent || event.prompt || ''
  const apiKey = process.env.DEEPSEEK_API_KEY || ''

  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY 未配置，请在云函数环境变量中设置')
    return {
      success: false,
      error: 'DeepSeek API Key 未配置，请在云函数环境变量中设置 DEEPSEEK_API_KEY'
    }
  }

  if (!articleContent) {
    return { success: false, error: '缺少 articleContent 或 prompt 参数' }
  }

  try {
    const https = require('https')

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          { role: 'user', content: articleContent }
        ],
        temperature,
        max_tokens: maxTokens
      })

      const url = new URL(DEEPSEEK_API_URL)
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 60000
      }

      const req = https.request(options, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            if (parsed.choices && parsed.choices[0]) {
              resolve({
                success: true,
                text: parsed.choices[0].message.content,
                usage: parsed.usage
              })
            } else {
              reject(new Error(parsed.error?.message || 'DeepSeek 返回格式异常'))
            }
          } catch (e) {
            reject(new Error(`JSON 解析失败: ${body.substring(0, 200)}`))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
      req.write(data)
      req.end()
    })

    return response
  } catch (err) {
    console.error('callDeepSeek error:', err)
    return { success: false, error: err.message }
  }
}
