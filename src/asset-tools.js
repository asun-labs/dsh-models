const string = { type: 'string', minLength: 1, maxLength: 500 }
const model = { type: 'object', properties: { modelId: string }, required: ['modelId'], additionalProperties: false }
const job = { type: 'object', properties: { jobId: string }, required: ['jobId'], additionalProperties: false }
export const assetTools = [
  { name: 'assets_search', description: '搜索本地三维资产索引，返回资源 ID、来源、作者和逐项许可；不下载模型。', inputSchema: { type: 'object', properties: {
    query: { type: 'string', maxLength: 500 }, domain: { type: 'string', enum: ['home', 'devices', 'equipment', 'misc'] },
    sourceId: string, category: string, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 50 },
  }, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'assets_get', description: '读取某项资产的原始格式、作者、来源、许可及使用注意事项。', inputSchema: model, annotations: { readOnlyHint: true } },
  { name: 'assets_catalog', description: '列出资产大类、来源及子类统计。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'assets_download', description: '将索引中的原始模型与许可记录下载到本 MCP 已绑定的工作区，不自动声明模型已被查看器加载。', inputSchema: model, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'assets_use', description: '开始下载并创建本地 Three.js 使用任务，返回 viewerUrl 和任务 ID。打开 viewerUrl 后才实际解析渲染，须用 assets_status 核对 ready。', inputSchema: model, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'assets_status', description: '读取本会话使用任务的实际下载、加载、错误或首帧完成状态。', inputSchema: job, annotations: { readOnlyHint: true } },
  { name: 'assets_cancel', description: '取消本会话的使用任务并撤销查看器访问；已下载的工作区文件保留。', inputSchema: job, annotations: { readOnlyHint: false, destructiveHint: false } },
]

export async function executeAssetTool(service, name, args = {}, { owner, signal, onProgress } = {}) {
  const tool = assetTools.find(tool => tool.name === name)
  if (!tool) throw new Error('未知资产工具。')
  const schema = tool.inputSchema
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(schema.properties, key))) throw new Error('工具参数无效。')
  for (const key of schema.required ?? []) if (!Object.hasOwn(args, key)) throw new Error(`缺少参数 ${key}。`)
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key]
    if (rule.type === 'string' && (typeof value !== 'string' || value.length < (rule.minLength ?? 0) || value.length > (rule.maxLength ?? 500) || (rule.enum && !rule.enum.includes(value)))) throw new Error(`参数 ${key} 无效。`)
    if (rule.type === 'integer' && (!Number.isSafeInteger(value) || value < rule.minimum || value > (rule.maximum ?? Number.MAX_SAFE_INTEGER))) throw new Error(`参数 ${key} 无效。`)
  }
  signal?.throwIfAborted()
  switch (name) {
    case 'assets_search': return service.search(args)
    case 'assets_get': return service.get(args.modelId)
    case 'assets_catalog': return service.catalog()
    case 'assets_download': return service.download(args.modelId, undefined, signal, onProgress)
    case 'assets_use': {
      const result = await service.use(args.modelId, undefined, owner)
      if (signal?.aborted) { service.cancel(result.id, owner); signal.throwIfAborted() }
      return result
    }
    case 'assets_status': return service.status(args.jobId, owner)
    case 'assets_cancel': return service.cancel(args.jobId, owner)
  }
}
