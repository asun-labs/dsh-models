import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createAssetMcpServer } from '../src/mcp.js'
import { createAssetService } from '../src/asset-service.js'

test('完整 MCP 可执行入口完成真实 stdio 握手、工具发现、索引检索与技能资源读取', async t => {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'dsh-models-mcp-')))
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('lib/mcp.cjs'), '--workspace', workspace], stderr: 'pipe' })
  let stderr = ''; transport.stderr?.on('data', value => { stderr += value.toString() })
  const client = new Client({ name: 'dsh-models-test', version: '1.0' }, { capabilities: {} })
  t.after(async () => { await client.close(); await transport.close(); await rm(workspace, { recursive: true, force: true }) })
  await client.connect(transport)
  const tools = (await client.listTools()).tools
  assert.equal(tools.length, 7)
  const response = await client.callTool({ name: 'assets_search', arguments: { domain: 'devices', query: 'laptop' } })
  assert.ok(response.structuredContent.items.some(model => model.id === 'kenney/laptop'))
  assert.equal((await client.callTool({ name: 'assets_get', arguments: { modelId: 'kenney/laptop', url: 'https://evil.test/' } })).isError, true)
  const resources = await client.listResources()
  const skill = await client.readResource({ uri: resources.resources[0].uri })
  assert.match(skill.contents[0].text, /assets_use/); assert.match(skill.contents[0].text, /不能用空画布/)
  assert.equal(stderr.includes('Error'), false, stderr)
})

test('MCP 工具对调用参数执行边界校验，未知 URL/路径不转发到服务', async t => {
  const service = createAssetService({ resolveWorkspace: async () => { throw new Error('不应访问工作区') } })
  const server = createAssetMcpServer(service)
  const client = new Client({ name: 'boundary-test', version: '1.0' }, { capabilities: {} })
  const [a, b] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close(); await service.close() })
  await server.connect(a); await client.connect(b)
  for (const [name, args] of [['assets_search', { limit: 1000 }], ['assets_use', { modelId: 'kenney/laptop', workspace: 'C:/outside' }], ['assets_download', { url: 'https://evil.test/file' }]])
    assert.equal((await client.callTool({ name, arguments: args })).isError, true)
})
