import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { realpath, stat, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAssetService } from './asset-service.js'
import { assetTools, executeAssetTool } from './asset-tools.js'
import { skillUrl } from './skill.js'

export function createAssetMcpServer(service) {
  const owner = Symbol('mcp-session')
  const server = new Server({ name: 'dsh-models', version: '0.1.4' }, { capabilities: { tools: {}, resources: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: assetTools }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const token = request.params._meta?.progressToken
      const value = await executeAssetTool(service, request.params.name, request.params.arguments, { owner, signal: extra.signal,
        onProgress: progress => {
          if (token !== undefined) void extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token,
            progress: progress.received, ...(progress.total > 0 ? { total: progress.total } : {}), message: progress.filename } }).catch(() => {})
        } })
      return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] } }
  })
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: 'dsh-models://skills/dsh-models-use', name: 'dsh-models-use', mimeType: 'text/markdown', description: '三维资产检索、许可、下载与预览技能' }] }))
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    if (request.params.uri !== 'dsh-models://skills/dsh-models-use') throw new Error('未知技能资源。')
    return { contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: await readFile(skillUrl, 'utf8') }] }
  })
  return server
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('dsh-models MCP：检索、下载和使用三维资产。\n用法：node lib/mcp.cjs --workspace <绝对目录>\n示例：node lib/mcp.cjs --workspace D:/work/scene\n查看器绑定本机回环随机端口，结束 MCP 后链接失效。\n'); return
  }
  if (args.length !== 2 || args[0] !== '--workspace' || !isAbsolute(args[1])) throw new Error('请用 --workspace 指定绝对工作区目录，或 --help 查看示例。')
  const path = await realpath(args[1])
  if (!(await stat(path)).isDirectory()) throw new Error('工作区不是目录。')
  const service = createAssetService({ resolveWorkspace: async () => ({ id: 'mcp', title: 'MCP 工作区', path }) })
  const server = createAssetMcpServer(service)
  let stopping = false
  async function stop() { if (stopping) return; stopping = true; await service.close(); await server.close() }
  server.onclose = () => { void stop() }
  process.once('SIGTERM', () => { void stop() }); process.once('SIGINT', () => { void stop() })
  process.stdin.once('end', () => { void stop() })
  await server.connect(new StdioServerTransport())
}

// 此入口构建为独立 CJS 可执行文件，不作为插件 Host 导入。
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { process.stderr.write(`dsh-models MCP: ${error.message}\n`); process.exitCode = 1 })
