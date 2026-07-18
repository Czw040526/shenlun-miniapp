# 每日申论素材后台

这个后台负责把“慢操作”移出小程序：

1. 抓取人民网观点频道前一天文章
2. 调用 DeepSeek 生成固定模板成品稿
3. 预览、复制、手动修改
4. 发布到小程序云数据库

## 启动

```powershell
cd D:\AI\每日申论\shenlun-miniapp\web-admin
copy .env.example .env
notepad .env
node server.js
```

打开：

```text
http://127.0.0.1:8787
```

## 7:30 自动生成

保持 `AUTO_GENERATE=1`，并让这个后台程序在电脑上运行。每天早上 7:30 会自动生成“前一天”的素材。

例如：2026-07-17 07:30 生成 2026-07-16 的人民网观点内容。

## 发布到小程序

需要先部署云函数 `publishMaterial`，并把它的 HTTP 访问地址填到：

```text
PUBLISH_FUNCTION_URL=
```

同时在本地 `.env` 和云函数环境变量中设置同一个：

```text
PUBLISH_ADMIN_SECRET=
```

未配置 `PUBLISH_FUNCTION_URL` 时，后台仍可生成和预览，点击发布会保存到 `web-admin/output/`。
