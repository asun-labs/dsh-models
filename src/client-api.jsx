import React, { useState } from 'react'
import catalog from './savage-catalog.json'
import { categories, categoryLabels, filterModels } from './catalog.js'
import { styles } from './styles.js'

export const inject = ['slots', 'layout']
const PAGE_SIZE = 24

function ModelCard({ model }) {
  const [failed, setFailed] = useState(false)
  return <article className="seal-model-card">
    <div className="seal-model-image">
      {model.thumbnailUrl && !failed
        ? <img src={model.thumbnailUrl} alt={`${model.name} 模型预览`} width="128" height="128" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="seal-model-placeholder">暂无截图</span>}
      <span className="seal-model-format">{model.format}</span>
    </div>
    <div className="seal-model-body">
      <span className="seal-model-category">{categoryLabels[model.category] ?? model.category}</span>
      <h2>{model.name}</h2>
      <p className="seal-model-description" title={model.description}>{model.description}</p>
      <p className="seal-model-directory" title={model.sourceDirectory}>{model.sourceDirectory}</p>
      <div className="seal-model-links">
        <a href={model.sourcePage} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${model.name} 来源`}>查看来源 ↗</a>
        {model.modelUrl ? <a href={model.modelUrl} target="_blank" rel="noopener noreferrer" aria-label={`下载 ${model.name} X3D`}>下载 X3D ↓</a>
          : <span title={model.downloadUnavailable}>下载暂不可用</span>}
      </div>
    </div>
  </article>
}

export function ModelsPanel({ snapshot = catalog }) {
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const groups = categories(snapshot.models)
  const models = filterModels(snapshot.models, category, query)
  const pageCount = Math.max(1, Math.ceil(models.length / PAGE_SIZE))
  const visible = models.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return <main className="seal-models-page" data-seal-panel="dsh-models">
    <header className="seal-models-header">
      <div><h1>模型库</h1><p>浏览 SAVAGE 三维模型，找到需要的资源</p></div>
      <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">NPS SAVAGE ↗</a>
    </header>
    <div className="seal-models-filters">
      <label>资源分类<select value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}>
        <option value="">全部分类（{snapshot.models.length}）</option>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}（{group.count}）</option>)}
      </select></label>
      <label className="seal-models-search">搜索模型<input type="search" placeholder="搜索名称、型号或描述，如 F-16" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label>
      {(category || query) && <button type="button" onClick={() => { setCategory(''); setQuery(''); setPage(1) }}>清除筛选</button>}
    </div>
    <div className="seal-models-summary" role="status">{categoryLabels[category] ?? '全部资源'} · {models.length} 条资源<span>目录更新于 {new Date(snapshot.indexedAt).toLocaleDateString('zh-CN')}</span></div>
    <p className="seal-models-note">资源含完整模型、零部件和场景。下载为原始 X3D，部分模型需同时取得来源页中的纹理或部件。</p>
    {visible.length ? <section className="seal-models-grid" aria-label="模型列表">{visible.map(model => <ModelCard key={model.id} model={model} />)}</section>
      : <div className="seal-models-empty"><h2>没有找到匹配的模型</h2><p>试试其他型号，或清除分类和搜索条件。</p></div>}
    <nav className="seal-models-pagination" aria-label="模型列表分页">
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</button>
      <span>第 {page} / {pageCount} 页</span>
      <button type="button" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>下一页</button>
    </nav>
    <footer>来源：美国海军研究生院 NPS SAVAGE · 预览图片与模型归原作者所有 · <a href="https://savage.nps.edu/Savage/license.html" target="_blank" rel="noopener noreferrer">源站许可说明</a></footer>
  </main>
}

export function apply(ctx, integration = {}) {
  ctx.effect(() => {
    const element = document.createElement('style')
    element.dataset.plugin = 'dsh-models'
    element.textContent = styles
    document.head.append(element)
    return () => element.remove()
  }, 'dsh-models: styles')
  const options = { id: 'dsh-models', label: '模型库', order: 115 }
  if (integration.registerPanel) {
    integration.registerPanel(options, ModelsPanel)
    return
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: options.id }, ModelsPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', ...options }, ModelIcon))
}

function ModelIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5" /></svg>
}
