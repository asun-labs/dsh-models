import { randomBytes, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { assetCatalog, domains, sources, filterAssets } from './asset-catalog.js'
import { categories } from './catalog.js'
import { DownloadError, saveModel } from './download.js'
import { resolveVrml } from './preview-source.js'
import { createViewerServer } from './viewer-server.js'
import { prepareVrml } from './prepare-vrml.js'

export function createAssetService({ models = assetCatalog.models, resolveWorkspace, fetchImpl = fetch, viewerRoot, lifetimeSignal } = {}) {
  const records = new Map(models.map(model => [model.id, model]))
  const jobs = new Map()
  let server, serverPromise, closed = false, closePromise
  const getModel = id => {
    const model = records.get(id)
    if (!model) throw new DownloadError('没有找到该资产，请刷新资产库。', 'invalidInput')
    return model
  }
  function getJob(id, owner) {
    const job = jobs.get(id)
    if (!job || job.owner !== owner) throw new DownloadError('使用任务已失效或不属于当前连接。', 'notFound')
    return job
  }
  const snapshot = job => ({ id: job.id, phase: job.phase, model: job.model, progress: job.progress, warnings: job.warnings,
    result: job.result, error: job.error, metrics: job.metrics, viewerUrl: `${server.origin}/v/${job.token}/` })
  async function ensureServer() {
    if (closed) throw new DownloadError('资产服务已关闭。')
    serverPromise ??= createViewerServer({ viewerRoot, findJob: token => [...jobs.values()].find(job => job.token === token), snapshot })
    server = await serverPromise
    if (closed) { await server.close(); throw new DownloadError('资产服务已关闭。') }
    return server
  }
  const combined = signal => AbortSignal.any([signal, lifetimeSignal, AbortSignal.timeout(120000)].filter(Boolean))
  async function download(modelId, workspaceId, signal, onProgress) {
    if (closed) throw new DownloadError('资产服务已关闭。')
    const model = getModel(modelId)
    const lifetime = combined(signal)
    const workspace = await resolveWorkspace(workspaceId, lifetime)
    lifetime.throwIfAborted()
    return saveModel(model, workspace, { fetchImpl, signal: lifetime, onProgress })
  }
  async function run(job, workspaceId, peerSignal) {
    const signal = combined(AbortSignal.any([job.controller.signal, peerSignal].filter(Boolean)))
    try {
      const model = getModel(job.model.id)
      const workspace = await resolveWorkspace(workspaceId, signal)
      job.workspaceRoot = await realpath(workspace.path)
      job.phase = 'downloading'
      const progress = value => { job.progress = value }
      const original = await saveModel(model, workspace, { fetchImpl, signal, onProgress: progress })
      job.result = { ...original, format: model.format, originalPath: original.path }
      if (model.format === 'X3D') {
        job.phase = 'resolving-preview'; job.progress = null
        const modelUrl = await resolveVrml(model, fetchImpl, signal)
        job.phase = 'downloading-preview'
        const previewModel = { ...model, modelUrl, format: 'VRML', usageNotes: `${model.usageNotes ?? ''} Three.js 静态预览使用源站 VRML97 同源版本；原始 X3D 保留。` }
        const saved = await saveModel(previewModel, workspace, { fetchImpl, signal, onProgress: progress })
        const preview = await prepareVrml(previewModel, saved, workspace, { fetchImpl, signal, onProgress: progress, models })
        const { resources, ...files } = preview
        job.resources = resources
        job.result = { ...files, format: 'VRML', originalPath: original.path }
        job.warnings = [`静态 VRML97 预览，不执行 X3D/VRML 脚本和 ROUTE 交互。已取得 ${preview.dependencies.filter(item => item.format === 'VRML').length} 个同源子场景、${Object.keys(resources).length} 张纹理；未支持的原型会明确报错。`]
      }
      signal.throwIfAborted()
      job.phase = 'downloaded'
    } catch (error) {
      job.phase = signal.aborted ? 'cancelled' : 'error'
      job.error = signal.aborted ? '使用已取消或下载超时，可重试。' : error.message
    }
  }
  async function use(modelId, workspaceId, owner, peerSignal) {
    const model = getModel(modelId)
    if (!model.modelUrl) throw new DownloadError('源站未提供下载地址。')
    await ensureServer()
    if ([...jobs.values()].filter(job => ['queued', 'downloading', 'resolving-preview', 'downloading-preview'].includes(job.phase)).length >= 4)
      throw new DownloadError('正在准备的资产较多，请完成或取消后重试。')
    if (jobs.size >= 64) {
      const previous = [...jobs.values()].find(job => ['ready', 'downloaded', 'error', 'cancelled'].includes(job.phase))
      if (!previous) throw new DownloadError('使用任务数量已达上限，请关闭旧查看器。')
      previous.detach?.(); jobs.delete(previous.id)
    }
    const job = { id: randomUUID(), token: randomBytes(24).toString('base64url'), owner, controller: new AbortController(), phase: 'queued',
      model: { id: model.id, name: model.name, format: model.format, author: model.author, license: model.license,
        sourcePage: model.sourcePage, licenseUrl: model.licenseUrl }, progress: null, warnings: [] }
    jobs.set(job.id, job)
    if (peerSignal) {
      const disconnected = () => { job.controller.abort(); job.phase = 'cancelled'; job.error = '连接已断开。' }
      peerSignal.addEventListener('abort', disconnected, { once: true })
      job.detach = () => peerSignal.removeEventListener('abort', disconnected)
      if (peerSignal.aborted) disconnected()
    }
    job.task = run(job, workspaceId, peerSignal)
    return snapshot(job)
  }
  function cancel(id, owner) {
    const job = getJob(id, owner)
    job.controller.abort(); job.phase = 'cancelled'; job.error = '使用已取消。'
    return snapshot(job)
  }
  function search({ query = '', domain = '', sourceId = '', category = '', offset = 0, limit = 20 } = {}) {
    if ([query, domain, sourceId, category].some(value => typeof value !== 'string' || value.length > 500)
      || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new DownloadError('搜索参数无效。', 'invalidInput')
    const items = filterAssets(models, { query, domain, sourceId, category })
    return { total: items.length, offset, items: items.slice(offset, offset + limit).map(({ thumbnailUrl, ...model }) => model) }
  }
  function close() {
    if (closePromise) return closePromise
    closed = true
    return closePromise = (async () => {
      for (const job of jobs.values()) { job.controller.abort(); job.detach?.() }
      await Promise.allSettled([...jobs.values()].map(job => job.task))
      jobs.clear()
      if (serverPromise) await serverPromise.then(server => server.close(), () => {})
      lifetimeSignal?.removeEventListener('abort', stop)
    })()
  }
  const stop = () => { void close() }
  lifetimeSignal?.addEventListener('abort', stop, { once: true })
  return { search, get: getModel, catalog: () => ({ domains, sources, categories: categories(models), count: models.length }), download, use,
    status: (id, owner) => snapshot(getJob(id, owner)), cancel, close }
}
