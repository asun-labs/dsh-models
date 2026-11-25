import { createAssetService } from './asset-service.js'
import { DownloadError } from './download.js'
import { registerAgentIntegration } from './agent-integration.js'

export const name = 'dsh-models'
export const usage = '发现、下载和使用三维资产，本地 Three.js 查看器与会话 MCP/技能共享来源和工作区边界。'
export const inject = ['connection', 'webServer', 'workspaceRegistry', 'workspaceController']

export function createDownloadHandler(ctx, options = {}) {
  const service = createAssetService({ ...options, async resolveWorkspace(workspaceId, signal) {
    signal.throwIfAborted()
    if (workspaceId !== undefined) {
      const workspace = ctx.workspaceRegistry.get(workspaceId)
      if (!workspace) throw new DownloadError('当前工作区已不可用，请重新选择工作区。', 'workspaceUnavailable')
      return workspace
    }
    const value = await ctx.workspaceController.initializeDefault(signal)
    if (!value?.workspace) throw new DownloadError('当前没有选中工作区，应用也没有可用的默认工作区，请先选择工作区。', 'workspaceUnavailable')
    return value.workspace
  } })
  const fields = { download: ['modelId', 'workspaceId'], use: ['modelId', 'workspaceId'], status: ['jobId'], cancel: ['jobId'] }
  const handler = async (endpoint, payload, requestSignal, peer) => {
    if (peer?.principal?.kind !== 'owner') return { ok: false, error: { code: 'forbidden', message: '当前连接没有资产操作权限。', details: {} } }
    try {
      const allowed = fields[endpoint]
      if (!allowed || !payload || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).some(key => !allowed.includes(key))
        || (['download', 'use'].includes(endpoint) && (typeof payload.modelId !== 'string' || !payload.modelId || payload.modelId.length > 500))
        || (payload.workspaceId !== undefined && (typeof payload.workspaceId !== 'string' || !payload.workspaceId))
        || (['status', 'cancel'].includes(endpoint) && typeof payload.jobId !== 'string')) throw new DownloadError('资产请求无效。', 'invalidInput')
      const owner = peer.signal ?? peer
      requestSignal?.throwIfAborted()
      let value
      if (endpoint === 'download') value = await service.download(payload.modelId, payload.workspaceId, AbortSignal.any([requestSignal, peer.signal].filter(Boolean)))
      if (endpoint === 'use') {
        value = await service.use(payload.modelId, payload.workspaceId, owner, peer.signal)
        if (requestSignal?.aborted) { service.cancel(value.id, owner); requestSignal.throwIfAborted() }
      }
      if (endpoint === 'status') value = service.status(payload.jobId, owner)
      if (endpoint === 'cancel') value = service.cancel(payload.jobId, owner)
      return { ok: true, value }
    } catch (error) {
      return { ok: false, error: { code: error.code ?? 'downloadFailed', message: error.name === 'AbortError' ? '操作已取消。' : error.message, details: {} } }
    }
  }
  handler.close = service.close
  return handler
}

export function apply(ctx) {
  const handler = createDownloadHandler(ctx)
  ctx.effect(() => () => handler.close())
  ctx.connection.rpc.handle('/dsh-models', handler)
  registerAgentIntegration(ctx)
}
