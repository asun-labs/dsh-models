import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createDownloadHandler } from '../src/index.js'
import { saveModel } from '../src/download.js'
import { selectedWorkspaceId } from '../src/workspace-selection.js'

const model = { id: 'GroundVehicles/M1A1/M1A1', modelUrl: 'https://savage.nps.edu/Savage/GroundVehicles/M1A1/M1A1.x3d' }
const xml = '<?xml version="1.0"?><!DOCTYPE X3D PUBLIC "x" "y"><X3D><Scene/></X3D>'
const peer = { principal: { kind: 'owner' } }
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-models-download-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const selected = { id: 'selected', path: join(root, 'selected'), title: '当前工作区' }
  const fallback = { workspaceId: 'default', path: join(root, 'default'), title: '默认工作区' }
  await mkdir(selected.path); await mkdir(fallback.path)
  let defaultCalls = 0
  const ctx = { workspaceRegistry: { get: id => id === selected.id ? selected : undefined },
    workspaceController: { initializeDefault: async () => { defaultCalls++; return { workspace: fallback } } } }
  const handler = createDownloadHandler(ctx, { models: [model], fetchImpl: async () => new Response(xml) })
  return { root, selected, fallback, ctx, handler, defaultCalls: () => defaultCalls }
}

test('选中工作区优先；无选择时使用宿主默认工作区，重复下载不覆盖', async t => {
  const f = await fixture(t)
  const first = await f.handler('download', { modelId: model.id, workspaceId: 'selected' }, undefined, peer)
  assert.equal(first.ok, true)
  assert.equal(first.value.path, join(f.selected.path, 'models/SAVAGE/GroundVehicles/M1A1/M1A1.x3d'))
  assert.equal(await readFile(first.value.path, 'utf8'), xml)
  assert.equal(f.defaultCalls(), 0)
  const second = await f.handler('download', { modelId: model.id, workspaceId: 'selected' }, undefined, peer)
  assert.match(second.value.path, /M1A1 \(2\)\.x3d$/)
  const fallback = await f.handler('download', { modelId: model.id }, undefined, peer)
  assert.equal(fallback.ok, true); assert.ok(fallback.value.path.startsWith(f.fallback.path))
  assert.equal(f.defaultCalls(), 1)
})

test('失效选中项不回退；缺少默认工作区、未知模型和越权请求拒绝写入', async t => {
  const f = await fixture(t)
  assert.equal((await f.handler('download', { modelId: model.id, workspaceId: 'deleted' }, undefined, peer)).error.code, 'workspaceUnavailable')
  assert.equal(f.defaultCalls(), 0)
  f.ctx.workspaceController.initializeDefault = async () => undefined
  assert.match((await f.handler('download', { modelId: model.id }, undefined, peer)).error.message, /请先选择工作区/)
  assert.equal((await f.handler('download', { modelId: 'unknown' }, undefined, peer)).error.code, 'invalidInput')
  assert.equal((await f.handler('download', { modelId: model.id, path: f.root }, undefined, peer)).error.code, 'invalidInput')
  assert.equal((await f.handler('download', { modelId: model.id }, undefined, { principal: { kind: 'remote' } })).error.code, 'forbidden')
  assert.deepEqual(await readdir(f.selected.path), [])
})

test('源站错误、非模型内容、过大与中断清理临时文件，不发布损坏模型', async t => {
  const f = await fixture(t)
  await assert.rejects(saveModel(model, f.selected, { fetchImpl: async () => new Response('bad', { status: 403 }) }), /403/)
  await assert.rejects(saveModel(model, f.selected, { fetchImpl: async () => new Response('<html>error</html>') }), /不是有效/)
  await assert.rejects(saveModel(model, f.selected, { fetchImpl: async () => new Response(xml), maxBytes: 5 }), /上限/)
  const controller = new AbortController()
  await assert.rejects(saveModel(model, f.selected, { signal: controller.signal, fetchImpl: async () => new Response(new ReadableStream({ start(stream) {
    stream.enqueue(new TextEncoder().encode(xml)); controller.abort()
  } })) }))
  assert.deepEqual(await readdir(join(f.selected.path, 'models/SAVAGE/GroundVehicles/M1A1')), [])
})

test('下载目录链接不能指向工作区之外', async t => {
  const f = await fixture(t)
  await symlink(f.fallback.path, join(f.selected.path, 'models'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(saveModel(model, f.selected, { fetchImpl: async () => new Response(xml) }), /超出工作区/)
  assert.deepEqual(await readdir(f.fallback.path), [])
})

test('客户端按当前主视图会话解析工作区，并在每次点击重新读取', () => {
  const sessions = { phase: 'ready', byId: { a: { id: 'a', retainedBy: { mainView: 1 } }, b: { id: 'b', retainedBy: { mainView: 1 } } } }
  const workspaces = { phase: 'ready', items: [{ workspaceId: 'wa', sessionIds: ['a'] }, { workspaceId: 'wb', sessionIds: ['b'] }] }
  let key = 'b'
  const ctx = { get: () => ({ adapter: { current: { value: { key } } } }), sessions: { list: { getSnapshot: () => sessions } }, workspaces: { list: { getSnapshot: () => workspaces } } }
  assert.equal(selectedWorkspaceId(ctx), 'wb')
  sessions.byId.b.retainedBy.mainView = 0
  assert.equal(selectedWorkspaceId(ctx), 'wb')
  key = 'a'; assert.equal(selectedWorkspaceId(ctx), 'wa')
  sessions.byId = {}; assert.throws(() => selectedWorkspaceId(ctx), /切换尚未完成/)
  key = undefined; assert.equal(selectedWorkspaceId(ctx), undefined)
  workspaces.phase = 'pending'; assert.throws(() => selectedWorkspaceId(ctx), /尚未读取完成/)
})

test('GLB 下载保留归属和许可，不接收伪造模型或其他仓库 URL', async t => {
  const f = await fixture(t)
  const bytes = Buffer.alloc(20)
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(20, 8)
  const glb = { ...model, id: 'kenney/laptop', format: 'GLB', name: 'Laptop', author: 'Kenney', license: 'CC0-1.0',
    modelUrl: 'https://raw.githubusercontent.com/yuyou-dev/OpenHome3D/cb52afc00201b4b7ed90b24631e977112ba07869/public/models/kenney/laptop.glb',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', sourcePage: 'https://github.com/yuyou-dev/OpenHome3D', attribution: 'Kenney — CC0' }
  const result = await saveModel(glb, f.selected, { fetchImpl: async () => new Response(bytes) })
  assert.deepEqual(await readFile(result.path), bytes)
  const metadata = JSON.parse(await readFile(result.path + '.source.json', 'utf8'))
  assert.equal(metadata.author, 'Kenney'); assert.equal(metadata.license, 'CC0-1.0'); assert.equal(metadata.attribution, glb.attribution)
  await assert.rejects(saveModel(glb, f.selected, { fetchImpl: async () => new Response('version https://git-lfs.github.com/spec/v1') }), /不是完整的 GLB/)
  await assert.rejects(saveModel({ ...glb, modelUrl: 'https://raw.githubusercontent.com/other/repo/main/file.glb' }, f.selected), /下载地址无效/)
})
