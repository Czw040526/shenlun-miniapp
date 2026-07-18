const state = {
  status: null,
  articles: [],
  material: null
}

const els = {
  targetDate: document.querySelector('#targetDate'),
  deepSeekStatus: document.querySelector('#deepSeekStatus'),
  publishStatus: document.querySelector('#publishStatus'),
  schedulerStatus: document.querySelector('#schedulerStatus'),
  dateInput: document.querySelector('#dateInput'),
  collectBtn: document.querySelector('#collectBtn'),
  generateBtn: document.querySelector('#generateBtn'),
  publishBtn: document.querySelector('#publishBtn'),
  copyBtn: document.querySelector('#copyBtn'),
  notice: document.querySelector('#notice'),
  articleCount: document.querySelector('#articleCount'),
  articleList: document.querySelector('#articleList'),
  previewText: document.querySelector('#previewText'),
  copyCount: document.querySelector('#copyCount')
}

function setBusy(isBusy) {
  els.collectBtn.disabled = isBusy
  els.generateBtn.disabled = isBusy
  els.publishBtn.disabled = isBusy
}

function showNotice(message, ok = false) {
  els.notice.textContent = message
  els.notice.classList.toggle('ok', ok)
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json()
  if (!res.ok && !data.error) throw new Error(`HTTP ${res.status}`)
  return data
}

function renderStatus(data) {
  state.status = data
  els.targetDate.textContent = data.targetDateLabel
  els.dateInput.value = data.targetDate
  els.deepSeekStatus.textContent = data.deepSeekReady ? '已配置' : '未配置'
  els.deepSeekStatus.style.color = data.deepSeekReady ? '#047857' : '#b91c1c'
  els.publishStatus.textContent = data.publishReady ? '已配置' : '本地保存'
  els.publishStatus.style.color = data.publishReady ? '#047857' : '#b45309'
  els.schedulerStatus.textContent = data.scheduler.lastMessage || (data.autoGenerate ? '已开启' : '已关闭')
}

function renderArticles(articles) {
  state.articles = articles || []
  els.articleCount.textContent = `${state.articles.length} 篇`
  if (!state.articles.length) {
    els.articleList.className = 'article-list empty'
    els.articleList.textContent = '还没有抓取文章'
    return
  }
  els.articleList.className = 'article-list'
  els.articleList.innerHTML = state.articles.map(article => {
    const tierClass = `t${article.tier || 1}`
    const error = article.error ? `<span class="chip">抓取失败</span>` : ''
    return `
      <article class="article-item">
        <div class="article-meta">
          <span class="chip ${tierClass}">T${article.tier || 1}</span>
          <span class="chip">${escapeHtml(article.column || '人民网观点')}</span>
          ${error}
        </div>
        <div class="article-title">${escapeHtml(article.title || '未命名文章')}</div>
        <div class="article-url">${escapeHtml(article.url || '')}</div>
      </article>
    `
  }).join('')
}

function renderMaterial(material) {
  state.material = material || null
  const text = material && material.copyText ? material.copyText : ''
  els.previewText.value = text
  els.copyCount.textContent = `${text.length} 字`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function loadStatus() {
  const result = await api('/api/status')
  renderStatus(result.data)
  const message = result.data.publishReady
    ? '后台已就绪：可抓取、生成并发布到小程序。'
    : '后台可生成预览；未配置 PUBLISH_FUNCTION_URL 时，发布会先保存本地 JSON 文件。'
  showNotice(message, result.data.deepSeekReady)
}

async function collectArticles() {
  setBusy(true)
  showNotice('正在抓取人民网观点文章...')
  try {
    const result = await api('/api/collect', {
      method: 'POST',
      body: { targetDate: els.dateInput.value }
    })
    renderArticles(result.articles)
    showNotice(`已抓取 ${result.articles.length} 篇文章。`, true)
  } catch (err) {
    showNotice(`抓取失败：${err.message}`)
  } finally {
    setBusy(false)
  }
}

async function generateMaterial() {
  setBusy(true)
  showNotice('正在生成成品稿，DeepSeek 可能需要几十秒...')
  try {
    const result = await api('/api/generate', {
      method: 'POST',
      body: {
        targetDate: els.dateInput.value,
        articles: state.articles
      }
    })
    renderArticles(result.articles)
    renderMaterial(result.material)
    showNotice(`已生成：${result.material.title}。本地文件：${result.savedPath}`, true)
  } catch (err) {
    showNotice(`生成失败：${err.message}`)
  } finally {
    setBusy(false)
  }
}

async function publishMaterial() {
  if (!state.material) {
    showNotice('请先生成成品稿。')
    return
  }
  setBusy(true)
  showNotice('正在发布到小程序...')
  try {
    const result = await api('/api/publish', {
      method: 'POST',
      body: {
        material: state.material,
        articles: state.articles
      }
    })
    if (result.success) {
      showNotice('发布成功，小程序刷新后会读取这份成品稿。', true)
    } else {
      showNotice(`${result.error}。文件：${result.savedPath}`)
    }
  } catch (err) {
    showNotice(`发布失败：${err.message}`)
  } finally {
    setBusy(false)
  }
}

async function copyPreview() {
  const text = els.previewText.value
  if (!text) {
    showNotice('没有可复制的内容。')
    return
  }
  await navigator.clipboard.writeText(text)
  showNotice('全文已复制，可以直接粘贴。', true)
}

els.collectBtn.addEventListener('click', collectArticles)
els.generateBtn.addEventListener('click', generateMaterial)
els.publishBtn.addEventListener('click', publishMaterial)
els.copyBtn.addEventListener('click', copyPreview)
els.previewText.addEventListener('input', () => {
  if (!state.material) return
  state.material.copyText = els.previewText.value
  els.copyCount.textContent = `${els.previewText.value.length} 字`
})

loadStatus().catch(err => showNotice(`后台状态读取失败：${err.message}`))
