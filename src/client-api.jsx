import React, { useState, useEffect, useRef } from 'react'
import { assetCatalog as catalog, domains, sources, filterAssets } from './asset-catalog.js'
import { categories, categoryLabels } from './catalog.js'
import thumbnails from './thumbnails.json'
import { AssetBillboard } from './billboard.jsx'
import { styles } from './styles.js'
import { selectedWorkspaceId } from './workspace-selection.js'
import { AssetUsePage } from './use-page.jsx'

export const inject = ['slots', 'layout', 'connection', 'sessions', 'workspaces']
const PAGE_SIZE = 24

function ModelCard({ model, downloadModel, onUse }) {
  const [failed, setFailed] = useState(false)
  const [download, setDownload] = useState({ phase: 'idle' })
  const pending = useRef()
  const thumbnail = thumbnails[model.id] ?? model.thumbnailUrl
  const source = sources[model.sourceId ?? 'savage']
  useEffect(() => () => pending.current?.abort(), [])
  async function startDownload() {
    const controller = new AbortController()
    pending.current = controller
    setDownload({ phase: 'pending' })
    try {
      if (!downloadModel) throw new Error('下载服务不可用，请重新加载模型库插件。')
      const result = await downloadModel(model.id, controller.signal)
      if (!controller.signal.aborted) setDownload({ phase: 'done', path: result.path })
    } catch (error) {
      if (!controller.signal.aborted) setDownload({ phase: 'error', message: error.message })
    } finally { if (pending.current === controller) pending.current = undefined }
  }
  return <article className="seal-model-card">
    <div className="seal-model-image">
      {thumbnail && !failed
        ? <img src={thumbnail} alt={`${model.name} 模型预览`} width="200" height="160" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="seal-model-placeholder">暂无截图</span>}
      <span className="seal-model-format">{model.format}</span>
      <span className="seal-model-image-source">{source?.name ?? model.sourceId}</span>
    </div>
    <div className="seal-model-body">
      <span className="seal-model-category">{categoryLabels[model.category] ?? model.category}</span>
      <h2>{model.name}</h2>
      <p className="seal-model-description" title={model.description}>{model.description}</p>
      <p className="seal-model-directory" title={model.author ?? model.sourceDirectory}>{model.author ?? model.sourceDirectory}</p>
      <details className="seal-model-rights"><summary><span>{model.license ?? '查看许可'}</span> · 署名与使用说明</summary>
        <p>{model.usageNotes ?? '请在使用前核对来源页中的原始许可和作者。'}</p>
        {model.attribution && <p className="seal-model-attribution">{model.attribution}</p>}
        <a href={model.licenseUrl} target="_blank" rel="noopener noreferrer">许可原文 ↗</a>
        {model.originalSourceUrl && <a href={model.originalSourceUrl} target="_blank" rel="noopener noreferrer">原始资产包 ↗</a>}
      </details>
      <div className="seal-model-links">
        <a href={model.sourcePage} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${model.name} 来源`}>查看来源 ↗</a>
        <button type="button" className="seal-model-use-button" disabled={!model.modelUrl} title={model.downloadUnavailable} onClick={() => onUse(model)} aria-label={`使用 ${model.name}`}>使用</button>
        {model.modelUrl ? <button type="button" disabled={download.phase === 'pending'} onClick={startDownload} aria-label={`下载 ${model.name} ${model.format}`}>{download.phase === 'pending' ? '下载中…' : `下载 ${model.format} ↓`}</button>
          : <span title={model.downloadUnavailable}>下载暂不可用</span>}
      </div>
      {download.phase === 'done' && <p className="seal-model-download" role="status" title={download.path}>已保存到：{download.path}</p>}
      {download.phase === 'error' && <p className="seal-model-download" role="alert">{download.message}</p>}
    </div>
  </article>
}

export function ModelsPanel({ snapshot = catalog, downloadModel, useModel, getUseStatus, cancelUse }) {
  const [selectedUse, setSelectedUse] = useState(null)
  const [domain, setDomain] = useState(snapshot.models.some(model => model.domain === 'home') ? 'home' : 'equipment')
  const [sourceId, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const domainModels = filterAssets(snapshot.models, { domain })
  const sourceModels = filterAssets(domainModels, { sourceId })
  const groups = categories(sourceModels)
  const models = filterAssets(sourceModels, { category, query })
  const activeDomain = domains.find(entry => entry.id === domain)
  const availableSources = [...new Set(domainModels.map(model => model.sourceId ?? 'savage'))]
  function changeDomain(id) { setDomain(id); setSource(''); setCategory(''); setQuery(''); setPage(1) }
  const pageCount = Math.max(1, Math.ceil(models.length / PAGE_SIZE))
  const visible = models.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  if (selectedUse) return <AssetUsePage model={selectedUse} useModel={useModel} getUseStatus={getUseStatus} cancelUse={cancelUse} onBack={() => setSelectedUse(null)} />
  return <main className="seal-models-page" data-seal-panel="dsh-models">
    <AssetBillboard count={snapshot.models.length} sourceCount={new Set(snapshot.models.map(model => model.sourceId ?? 'savage')).size} />
    <nav className="seal-assets-tabs" role="tablist" aria-label="资产大类">
      {domains.map(entry => <button key={entry.id} id={`asset-tab-${entry.id}`} role="tab" aria-selected={domain === entry.id} aria-controls="asset-results" tabIndex={domain === entry.id ? 0 : -1}
        onClick={() => changeDomain(entry.id)} onKeyDown={event => {
          const index = domains.findIndex(item => item.id === domain)
          const next = event.key === 'ArrowRight' ? (index + 1) % domains.length : event.key === 'ArrowLeft' ? (index + domains.length - 1) % domains.length : event.key === 'Home' ? 0 : event.key === 'End' ? domains.length - 1 : -1
          if (next < 0) return
          event.preventDefault(); changeDomain(domains[next].id); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
        }}><small>{entry.mark}</small>{entry.label}<span>{filterAssets(snapshot.models, { domain: entry.id }).length}</span></button>)}
    </nav>
    <section id="asset-results" role="tabpanel" aria-labelledby={`asset-tab-${domain}`}>
    <div className="seal-assets-section-title"><h2>{activeDomain.label}</h2><p>{activeDomain.subtitle}</p></div>
    <div className="seal-models-filters">
      <label>资源来源<select value={sourceId} onChange={event => { setSource(event.target.value); setCategory(''); setPage(1) }}>
        <option value="">全部来源（{domainModels.length}）</option>
        {availableSources.map(id => <option key={id} value={id}>{sources[id]?.name ?? id}（{filterAssets(domainModels, { sourceId: id }).length}）</option>)}
      </select></label>
      <label>子类分类<select value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}>
        <option value="">全部子类（{sourceModels.length}）</option>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}（{group.count}）</option>)}
      </select></label>
      <label className="seal-models-search">搜索资产<input type="search" placeholder="名称、型号、作者…" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label>
      {(sourceId || category || query) && <button type="button" onClick={() => { setSource(''); setCategory(''); setQuery(''); setPage(1) }}>清除筛选</button>}
    </div>
    <div className="seal-models-summary" role="status">{categoryLabels[category] ?? activeDomain.label} · {models.length} 条资源<span>索引更新于 {new Date(snapshot.indexedAt).toLocaleDateString('zh-CN')}</span></div>
    <p className="seal-models-note">{sourceId ? sources[sourceId]?.licenseNote : '仅提供资产索引与快速对接，版权归原作者；使用前请核对每项资源的许可。'} 下载优先保存到左侧选中的工作区，未选择时使用应用默认工作区。X3D 的外部纹理或部件需另取。</p>
    {visible.length ? <section className="seal-models-grid" aria-label="模型列表">{visible.map(model => <ModelCard key={model.id} model={model} downloadModel={downloadModel} onUse={setSelectedUse} />)}</section>
      : <div className="seal-models-empty"><h2>没有找到匹配的模型</h2><p>试试其他型号，或清除分类和搜索条件。</p></div>}
    <nav className="seal-models-pagination" aria-label="模型列表分页">
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</button>
      <span>第 {page} / {pageCount} 页</span>
      <button type="button" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>下一页</button>
    </nav>
    </section>
    <footer><strong>开放资源，尊重创作。</strong> 本插件只提供发现与对接渠道，不代表资源作者或机构背书。<div>{Object.values(sources).map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>)}</div></footer>
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
  const options = { id: 'dsh-models', label: '资产库', order: 115 }
  async function downloadModel(modelId, signal) {
    const workspaceId = selectedWorkspaceId(ctx)
    const result = await ctx.connection.rpc.call('/dsh-models', 'download', { modelId, ...(workspaceId ? { workspaceId } : {}) }, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  async function rpc(endpoint, payload) {
    const result = await ctx.connection.rpc.call('/dsh-models', endpoint, payload, AbortSignal.timeout(30000))
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const useModel = modelId => {
    const workspaceId = selectedWorkspaceId(ctx)
    return rpc('use', { modelId, ...(workspaceId ? { workspaceId } : {}) })
  }
  const getUseStatus = jobId => rpc('status', { jobId })
  const cancelUse = jobId => rpc('cancel', { jobId })
  function Panel(props) { return <ModelsPanel {...props} downloadModel={downloadModel} useModel={useModel} getUseStatus={getUseStatus} cancelUse={cancelUse} /> }
  if (integration.registerPanel) {
    integration.registerPanel(options, Panel)
    return
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: options.id }, Panel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', ...options }, ModelIcon))
}

function ModelIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5" /></svg>
}
