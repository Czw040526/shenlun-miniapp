# 申论素材库 - 微信小程序

基于人民网观点频道（opinion.people.com.cn）的国考申论备考素材学习小程序。

## 功能概述

- **今日精读**：首页展示当日 AI 生成的“每日一篇”申论/面试精读稿
  - 今日选文：从前一天人民网观点文章里选择 1 篇最值得继续学的文章
  - 骨架拆解：把“动词+宾语”的论证短链、可迁移骨架和使用场景放在一块看
  - 素材工具箱：把对策四要素、规范词、金句和案例放在一块存；金句/案例各保留 1 个
  - 10分钟微练：每天只完成一项小练习，降低坚持成本
- **选文逻辑**：优先选择申论迁移价值高的短评或标准政论；地方类文章不会简单丢弃，而是作为“案例素材”处理，重点提取事实、做法和成效
  - 今日必背金句（一键复制）
- **文章详情**：结构拆解、金句提取、适用题型、学习要点
- **历史记录**：按日期浏览历史所有素材，支持展开查看
- **云端预生成**：微信云函数每日早 7:30 根据前一天人民网观点内容分批生成成品稿
- **一键复制全文**：小程序首页直接展示可复制成品稿，打开速度只取决于数据库读取

## 项目结构

```
shenlun-miniapp/
├── miniprogram/           # 小程序前端
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── sitemap.json
│   ├── pages/
│   │   ├── index/         # 首页（今日素材）
│   │   ├── detail/        # 文章详情页
│   │   └── history/       # 历史记录页
│   └── images/            # Tab Bar 图标（需自行添加）
├── cloud/
│   └── functions/
│       ├── generateDailyMaterial/   # 核心：7:30 定时分批生成每日一篇精读稿
│       ├── callDeepSeek/            # DeepSeek API 调用
│       ├── getDailyMaterial/        # 获取当日素材
│       ├── getArticleDetail/        # 获取文章详情
│       ├── getHistory/              # 获取历史记录
│       ├── publishMaterial/         # 可选：web-admin 发布成品稿
│       └── fetchPage/              # 网页抓取
├── web-admin/                       # 可选备用：本地网页后台
└── project.config.json
```

## 部署步骤

### 1. 注册微信小程序

在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序，获取 AppID。

### 2. 开通云开发

在微信开发者工具中打开项目，点击「云开发」开通环境。

### 3. 创建数据库集合

在云开发控制台创建以下集合：

| 集合名 | 用途 |
|--------|------|
| `daily_materials` | 存储每日生成的完整素材数据 |
| `history_index` | 历史记录索引（轻量，供列表页快速查询） |
| `material_generation_jobs` | 云函数分批生成任务进度、错误和中间结果 |

### 4. 配置 DeepSeek API Key

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 获取 API Key
2. 在云开发控制台 → 云函数 → `callDeepSeek` → 配置环境变量：
   - `DEEPSEEK_API_KEY`: 你的 API Key

### 5. 部署云函数

在微信开发者工具中，右键每个云函数目录，选择「上传并部署：云端安装依赖」。

建议至少部署：

| 云函数 | 必须 | 说明 |
|--------|------|------|
| `fetchPage` | 是 | 抓取人民网栏目页和文章页 |
| `callDeepSeek` | 是 | 调用 DeepSeek API |
| `generateDailyMaterial` | 是 | 7:30 启动，分批处理，最终选出一篇文章生成精读稿 |
| `getDailyMaterial` | 是 | 小程序首页读取成品稿 |
| `getHistory` | 是 | 历史页读取记录 |
| `getArticleDetail` | 是 | 旧版详情页兼容 |
| `publishMaterial` | 可选 | 只在使用本地 web-admin 时需要 |

建议把 `generateDailyMaterial`、`callDeepSeek`、`fetchPage` 的超时时间设为 60 秒。

### 6. 自动生成逻辑

`generateDailyMaterial/config.json` 已配置 3 个定时触发器：

- `dailyStart`：每天 7:30 启动前一天素材任务
- `materialWorkerEarly`：7:32-7:58 每 2 分钟续跑
- `materialWorker`：8:00-11:58 每 2 分钟续跑

函数每次只处理少量文章。逐篇分析完成后，会从候选文章中选择 1 篇最值得精读的文章，并按 `selection → framework → toolbox → practice` 逐模块生成并校验，全部通过后才最终合并保存。因此小程序打开时不会等待 DeepSeek，也不会出现多篇文章内容串篇。

选文时会同时判断文章用法：

- `短评表达训练`：通常来自“今日谈”，适合训练从生活小切口提炼大主题
- `结构范本`：通常来自“人民时评”“人民锐评”或“评论员观察”，适合模仿大作文分论点论证
- `案例素材`：地方发展类文章优先提取案例，不强行精读全文结构
- `主题精读`：归入对应知识树，作为当天的母题材料

### 7. 手动测试云端生成

在微信开发者工具云函数测试里，可以调用 `generateDailyMaterial`：

```json
{ "action": "start", "date": "2026-07-16", "force": true }
```

查看进度：

```json
{ "action": "status", "date": "2026-07-16" }
```

继续处理下一篇：

```json
{ "action": "work", "batchSize": 1 }
```

单篇分析完成后继续执行同一个 `work`，会依次生成并校验五个精读模块。模块都通过后，再执行最终汇总：

```json
{ "action": "finalize", "date": "2026-07-16" }
```

### 8. 可选：启动本地 web-admin

现在主流程不需要网页后台。若你想在电脑上预览、手动编辑或通过 HTTP 发布，可以再使用：

```powershell
cd D:\AI\每日申论\shenlun-miniapp\web-admin
copy .env.example .env
notepad .env
node server.js
```

打开 `http://127.0.0.1:8787`。

### 9. 上传前端代码

点击微信开发者工具工具栏的「上传」按钮，提交审核。

## DeepSeek API 接入说明

### 两个云函数分工

| 云函数 | 职责 |
|--------|------|
| `callDeepSeek` | 纯 API 调用封装，处理鉴权、超时、重试 |
| `generateDailyMaterial` | 业务逻辑：抓取文章列表 → 构造 prompt → 调用 callDeepSeek → 解析结果 → 存入数据库 |

### 数据流

```
generateDailyMaterial 每天 7:30
  → 计算前一天日期
  → 抓取 opinion.people.com.cn 栏目文章
  → 写入 material_generation_jobs
  → 每 2 分钟处理 1 篇文章
  → 单篇 DeepSeek 分析
  → 从候选文章中选择 1 篇最值得精读的文章
  → 逐模块生成 selection / framework / toolbox / practice
  → 每个模块分别校验日期、标题、链接、规范词和字段完整性
  → 精读模块通过后最终合并
  → 保存前进行整稿质量校验
  → 拼接固定 copyText 模板
  → 存入 daily_materials / history_index

用户打开小程序
  → getDailyMaterial 只查询数据库
  → 有数据？直接展示 copyText
  → 无数据？提示 7:30 后更新
```

### 降级策略

当个别文章的 DeepSeek 分析失败时，任务会记录错误并继续处理其余文章。若最终没有合格文章，或检测到标题、链接、日期、规范词、文章内容不匹配，任务会标记为 `failed` 并阻止错误数据覆盖数据库中的已有成稿。

### DeepSeek API 费用参考

- 模型：`deepseek-chat`
- 实际价格以 DeepSeek 开放平台控制台为准
- 分批模式会多次调用 API：若希望省额度，可把 `MAX_ARTICLES` 或 `LIMIT_PER_COLUMN` 调小

## Tab Bar 图标

需要在 `miniprogram/images/` 下放置 4 个 81×81 像素的 PNG 图标：

- `today.png` — 今日（未选中，灰色）
- `today-active.png` — 今日（选中，红色 #c41e3a）
- `history.png` — 历史（未选中，灰色）
- `history-active.png` — 历史（选中，红色 #c41e3a）

可使用 iconfont 或自行设计后放入该目录。

## 注意事项

1. **内容版权**：所有素材原文版权归人民网所有，本工具仅做学习摘编
2. **网页抓取**：人民网可能有反爬策略，`fetchPage` 已做基本处理（编码检测、重定向）
3. **云函数超时**：`generateDailyMaterial` 和 `callDeepSeek` 建议保持 60 秒
4. **API 限流**：DeepSeek 免费额度有限，建议设置每日生成次数上限
