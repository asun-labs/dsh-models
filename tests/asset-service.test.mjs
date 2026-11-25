import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, realpath, rm, symlink, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createAssetService } from '../src/asset-service.js'

export const glb = Buffer.alloc(20)
glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(20, 8)
export const model = { id: 'kenney/test', name: 'Test', format: 'GLB', sourceId: 'kenney', domain: 'devices', category: 'electronics',
  modelUrl: 'https://raw.githubusercontent.com/yuyou-dev/OpenHome3D/cb52afc00201b4b7ed90b24631e977112ba07869/public/models/kenney/test.glb',
  sourcePage: 'https://github.com/yuyou-dev/OpenHome3D', author: 'Kenney', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Kenney — CC0' }

export async function fixture(t, options = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-models-use-')))
  const service = createAssetService({ models: [model], resolveWorkspace: async () => ({ id: 'workspace', path: root }), fetchImpl: async () => new Response(glb, { headers: { 'Content-Length': glb.length } }), ...options })
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }) })
  return { root, service }
}
export async function settled(service, id, owner) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const job = service.status(id, owner)
    if (['downloaded', 'ready', 'error', 'cancelled'].includes(job.phase)) return job
    await delay(5)
  }
  throw new Error('任务未结束')
}

test('实际传输字节回报，下载完成与首帧完成分开；HTTP 限制路径、来源和任务所有者', async t => {
  const { root, service } = await fixture(t)
  const progress = []
  const result = await service.download(model.id, undefined, undefined, value => progress.push(value))
  assert.equal(progress[0].received, 0); assert.equal(progress.at(-1).received, glb.length)
  assert.equal(progress.at(-1).complete, true); assert.deepEqual(await readFile(result.path), glb)
  const owner = Symbol(), started = await service.use(model.id, undefined, owner)
  const job = await settled(service, started.id, owner)
  assert.equal(job.phase, 'downloaded'); assert.equal(job.metrics, undefined)
  assert.ok(job.result.path.startsWith(root)); assert.throws(() => service.status(job.id, Symbol()), /不属于/)
  const url = new URL('model', job.viewerUrl)
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), glb)
  const stateUrl = new URL('state', job.viewerUrl), origin = stateUrl.origin
  assert.equal((await fetch(stateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phase":"ready","meshes":1}' })).status, 403)
  assert.equal((await fetch(stateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{"phase":"ready","meshes":0}' })).status, 400)
  assert.equal((await fetch(new URL('../../../../etc/passwd', job.viewerUrl))).status, 404)
  const status = await fetch(new URL('status', job.viewerUrl))
  assert.equal(status.headers.get('access-control-allow-origin'), null)
  service.cancel(job.id, owner)
  assert.equal((await fetch(url)).status, 404)
  assert.equal(service.status(job.id, owner).phase, 'cancelled')
  assert.deepEqual(await readFile(result.path), glb)
})

test('取消和断连使使用失效，关闭服务后不遗留 partial 或监听端口', async t => {
  const { service, root } = await fixture(t, { fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(glb.subarray(0, 10)); signal.addEventListener('abort', () => controller.error(new DOMException('cancelled', 'AbortError')), { once: true })
  } }), { headers: { 'Content-Length': 20 } }) })
  const owner = Symbol(), peer = new AbortController()
  const job = await service.use(model.id, undefined, owner, peer.signal)
  await delay(20); peer.abort()
  assert.equal(service.status(job.id, owner).phase, 'cancelled')
  await service.close()
  const files = await readdir(root, { recursive: true })
  assert.equal(files.some(file => file.endsWith('.partial')), false)
  await assert.rejects(fetch(job.viewerUrl))
})

test('查看器关闭通知撤销自己的能力地址，已下载文件仍保留', async t => {
  const { service } = await fixture(t)
  const owner = Symbol(), started = await service.use(model.id, undefined, owner)
  const job = await settled(service, started.id, owner)
  const stateUrl = new URL('state', job.viewerUrl)
  const response = await fetch(stateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: stateUrl.origin }, body: '{"phase":"cancelled"}' })
  assert.equal(response.status, 200); assert.equal(service.status(job.id, owner).phase, 'cancelled')
  assert.equal((await fetch(job.viewerUrl)).status, 404)
  assert.deepEqual(await readFile(job.result.path), glb)
})

test('已登记模型文件被替换为工作区外符号链接时，HTTP 不返回外部文件', async t => {
  const { service, root } = await fixture(t)
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'dsh-models-outside-')))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const owner = Symbol(), use = await service.use(model.id, undefined, owner)
  const job = await settled(service, use.id, owner)
  await writeFile(join(outside, basename(job.result.path)), 'outside data')
  const parent = dirname(job.result.path), backup = join(root, 'previous-assets')
  assert.ok(parent.startsWith(root)); assert.ok(backup.startsWith(root))
  await rename(parent, backup)
  await symlink(outside, parent, process.platform === 'win32' ? 'junction' : 'dir')
  const response = await fetch(new URL('model', job.viewerUrl))
  assert.equal(response.status, 400); assert.equal((await response.text()).includes('outside data'), false)
})

test('VRML 子场景与纹理按实际引用取得，展开后有逐项来源，外域及循环引用失败', async t => {
  const base = 'https://savage.nps.edu/Savage/GroundVehicles/Test/'
  const x3d = { ...model, id: 'GroundVehicles/Test/Test', format: 'X3D', modelUrl: base + 'Test.x3d', sourcePage: base + 'TestIndex.html' }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZFYkAAAAASUVORK5CYII=', 'base64')
  const responses = new Map([
    [x3d.modelUrl, '<X3D><Scene/></X3D>'], [x3d.sourcePage, '<a href="Test.wrl">VRML</a>'],
    [base + 'Test.wrl', '#VRML V2.0 utf8\nGroup { children [ Inline { url ["part.x3d" "part.wrl"] } ] }'],
    [base + 'part.wrl', '#VRML V2.0 utf8\nDEF Box Shape { appearance Appearance { texture ImageTexture { url "image.jpg" } } geometry Box {} }'],
    [base + 'image.jpg', png],
  ])
  const requests = []
  const { service } = await fixture(t, { models: [x3d], fetchImpl: async url => {
    requests.push(url); assert.ok(url.startsWith(base)); const value = responses.get(url)
    return value === undefined ? new Response('missing', { status: 404 }) : new Response(value)
  } })
  const owner = Symbol(), use = await service.use(x3d.id, undefined, owner)
  const ready = await settled(service, use.id, owner)
  assert.equal(ready.phase, 'downloaded')
  assert.equal(ready.result.dependencies.length, 2)
  const text = await readFile(ready.result.path, 'utf8')
  assert.match(text, /DEF DSH_INLINE_\d+_Box/)
  const texture = text.match(/texture\/([a-f0-9]{32})/)[0]
  const image = await fetch(new URL(texture, ready.viewerUrl))
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
  const provenance = JSON.parse(await readFile(ready.result.path + '.source.json', 'utf8'))
  assert.equal(provenance.dependencies.length, 2)
  responses.set(base + 'Test.wrl', '#VRML V2.0 utf8\nInline { url "https://evil.test/private.wrl" }')
  const external = await service.use(x3d.id, undefined, owner)
  assert.equal((await settled(service, external.id, owner)).phase, 'error')
  responses.set(base + 'Test.wrl', '#VRML V2.0 utf8\nInline { url "Test.wrl" }')
  const loop = await service.use(x3d.id, undefined, owner)
  assert.match((await settled(service, loop.id, owner)).error, /循环引用/)
})
