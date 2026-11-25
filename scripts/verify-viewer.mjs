import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { assetCatalog } from '../src/asset-catalog.js'

if (process.argv.includes('--help')) {
  console.log('通过标准 MCP 和无头 Chromium 验收本地 Three.js：GLB/NASA/M1A1/F16、真实网格、旋转缩放和状态。\n示例：node scripts/verify-viewer.mjs\n文件与截图位于 .build/viewer，使用完整预编译 lib，无需前台输入。')
  process.exit(0)
}
const root = resolve(import.meta.dirname, '..'), output = join(root, '.build/viewer'), workspace = join(output, 'workspace')
mkdirSync(workspace, { recursive: true })
const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'lib/mcp.cjs'), '--workspace', workspace], stderr: 'pipe' })
let stderr = ''; transport.stderr?.on('data', data => { stderr += data.toString() })
const client = new Client({ name: 'dsh-models-viewer-check', version: '1.0' }, { capabilities: {} })
let browser
try {
  await client.connect(transport)
  assert.equal((await client.listTools()).tools.length, 7)
  const skill = await client.readResource({ uri: (await client.listResources()).resources[0].uri })
  assert.match(skill.contents[0].text, /assets_use/)
  browser = await chromium.launch({ headless: true })
  const asteroid = assetCatalog.models.find(model => model.sourceId === 'nasa' && model.name === '1999 RQ36 asteroid')
  for (const [name, modelId] of [['laptop', 'kenney/laptop'], ['nasa', asteroid.id], ['m1a1', 'GroundVehicles/M1A1/M1A1'], ['f16', 'AircraftFixedWing/F16FightingFalconTurkey/F16']]) {
    const result = await client.callTool({ name: 'assets_use', arguments: { modelId } })
    assert.equal(result.isError, undefined, JSON.stringify(result.content))
    const job = result.structuredContent
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(job.viewerUrl)
    await page.waitForFunction(() => ['ready', 'error'].includes(document.body.dataset.phase), null, { timeout: 150000 })
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'ready', await page.locator('body').innerText())
    const actual = (await client.callTool({ name: 'assets_status', arguments: { jobId: job.id } })).structuredContent
    assert.equal(actual.phase, 'ready'); assert.ok(actual.metrics.meshes > 0)
    const canvas = page.locator('canvas')
    assert.ok(Number(await canvas.getAttribute('data-meshes')) > 0)
    const before = await canvas.screenshot()
    await canvas.hover(); await page.mouse.wheel(0, 250); await page.waitForTimeout(200)
    assert.equal(before.equals(await canvas.screenshot()), false, '滚轮应改变实际视角')
    await page.getByRole('button', { name: '重置视角' }).click()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 8 }); await page.mouse.up()
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(output, name + '.png') })
    assert.deepEqual(errors, [])
    await page.close(); await client.callTool({ name: 'assets_cancel', arguments: { jobId: job.id } })
    assert.equal((await fetch(job.viewerUrl)).status, 404)
    console.log(`通过：${name} · ${actual.metrics.meshes} 网格 · ${actual.metrics.triangles} 三角形 · MCP/首帧/缩放旋转/重置/取消`)
  }
} catch (error) {
  console.error(String(error.message).replace(/http:\/\/127\.0\.0\.1:\d+\/v\/[A-Za-z0-9_-]+/g, '[本地任务]'), stderr.slice(-1000))
  process.exitCode = 1
} finally { await browser?.close(); await client.close(); await transport.close() }
