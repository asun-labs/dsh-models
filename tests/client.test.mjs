import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { buildPlugin } from '../scripts/build.mjs'

await buildPlugin()
const require = createRequire(import.meta.url)

function browser(t, entry = 'api') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let loaded
  if (entry === 'native') {
    runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
      window: { __ModuleLoader__: { load({ id, factory }) { assert.equal(id, 'dsh-models'); loaded = factory(require) } } },
      document: dom.window.document,
    })
  } else loaded = require('../lib/client-api.cjs')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    Object.assign(globalThis, previous)
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })
  return { loaded, root }
}

const sample = (id, category, name) => ({
  id, category, name, description: `${name} model`, sourceDirectory: 'Example', format: 'X3D',
  thumbnailUrl: `https://savage.nps.edu/Savage/${id}.png`,
  sourcePage: `https://savage.nps.edu/Savage/${id}Index.html`, modelUrl: `https://savage.nps.edu/Savage/${id}.x3d`,
})

test('分类、型号搜索、分页与截图失败保留来源和下载入口', async t => {
  const { loaded, root } = browser(t)
  const snapshot = { sourceUrl: 'https://savage.nps.edu/Savage/', indexedAt: '2026-11-25T00:00:00Z', models: [
    ...Array.from({ length: 25 }, (_, index) => sample(`AircraftFixedWing/F16/${index}`, 'AircraftFixedWing', `F 16 ${index}`)),
    { ...sample('GroundVehicles/M1A1/M1A1', 'GroundVehicles', 'M1A1'), thumbnailUrl: null },
  ] }
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, { snapshot })))
  assert.equal(document.querySelectorAll('article').length, 24)
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label)
  await act(async () => button('下一页').click())
  assert.equal(document.querySelectorAll('article').length, 2)
  const select = document.querySelectorAll('select')[1]
  await act(async () => Simulate.change(select, { target: { value: 'GroundVehicles' } }))
  assert.equal(document.querySelectorAll('article').length, 1)
  assert.match(document.querySelector('article').textContent, /M1A1.*暂无截图|暂无截图.*M1A1/)
  assert.equal(button('上一页').disabled, true)
  assert.ok(document.querySelector('article button[aria-label^="下载"]'))
  await act(async () => button('清除筛选').click())
  const input = document.querySelector('input[type="search"]')
  await act(async () => Simulate.change(input, { target: { value: 'F-16' } }))
  assert.match(document.querySelector('[role="status"]').textContent, /25 条资源/)
  const image = document.querySelector('article img')
  await act(async () => Simulate.error(image))
  assert.match(document.querySelector('article').textContent, /暂无截图/)
  assert.equal(document.querySelectorAll('article a[aria-label^="查看"]').length, 24)
  await act(async () => Simulate.change(input, { target: { value: 'does-not-exist' } }))
  assert.equal(document.querySelectorAll('article').length, 0)
  assert.match(document.body.textContent, /没有找到匹配的模型/)
  assert.equal(button('下一页').disabled, true)
})

test('原生 Loader 同步配置不作为宿主回调，原生槽位与样式随卸载释放', async t => {
  const { loaded } = browser(t, 'native')
  const entries = [], effects = []
  const ctx = {
    effect(callback) { const release = callback(); effects.push(release); return release },
    slots: {
      inject(name, callback) { return ctx.effect(callback) },
      register(options, component) { const entry = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) },
    },
  }
  const syncedConfig = {}
  Object.defineProperty(syncedConfig, 'registerPanel', { get() { throw new Error('原生同步配置不能作为宿主集成选项读取') } })
  loaded.apply(ctx, syncedConfig)
  assert.deepEqual(entries.map(entry => entry.options.name), ['main', 'sidebar.panellist'])
  assert.equal(entries[0].options.key, 'dsh-models')
  assert.equal(entries[1].options.label, '资产库')
  assert.ok(document.querySelector('style[data-plugin="dsh-models"]'))
  for (const release of effects.reverse()) release?.()
  assert.equal(entries.length, 0)
  assert.equal(document.querySelector('style[data-plugin="dsh-models"]'), null)
})

test('公开 client-api 可由宿主注册面板，不接管宿主侧栏', async t => {
  const { loaded } = browser(t)
  const effects = [], panels = []
  loaded.apply({ effect(callback) { effects.push(callback()) } }, {
    registerPanel(options, Panel) { panels.push({ options, Panel }) },
  })
  assert.equal(panels.length, 1)
  assert.equal(panels[0].options.id, 'dsh-models')
  assert.equal(typeof panels[0].Panel, 'function')
  for (const release of effects.reverse()) release?.()
})

test('源站拒绝的条目显示下载不可用并保留详情入口', async t => {
  const { loaded, root } = browser(t)
  const model = { ...sample('AircraftHelicopters/Example', 'AircraftHelicopters', 'Example'), modelUrl: null, downloadUnavailable: '来源详情返回 HTTP 403' }
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, { snapshot: {
    sourceUrl: 'https://savage.nps.edu/Savage/', indexedAt: '2026-11-25T00:00:00Z', models: [model],
  } })))
  assert.equal(document.querySelectorAll('article a[aria-label^="查看"]').length, 1)
  assert.equal(document.querySelector('article a[aria-label^="查看"]').href, model.sourcePage)
  assert.match(document.querySelector('article').textContent, /下载暂不可用/)
})

test('点击下载通过宿主 RPC 保存，切换工作区后重新读取并显示路径或错误', async t => {
  const { loaded, root } = browser(t)
  let workspaceId = 'current', Panel, reject = false
  const calls = [], effects = []
  loaded.apply({
    effect: callback => effects.push(callback()),
    sessions: { list: { getSnapshot: () => ({ phase: 'ready', byId: { s: { id: 's', retainedBy: { mainView: 1 } } } }) } },
    workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: workspaceId ? [{ workspaceId, sessionIds: ['s'] }] : [] }) } },
    connection: { rpc: { async call(channel, endpoint, payload, signal) {
      calls.push({ channel, endpoint, payload }); assert.equal(signal.aborted, false)
      return reject ? { ok: false, error: { message: '请选择工作区' } } : { ok: true, value: { path: 'D:/workspace/models/SAVAGE/Test.x3d' } }
    } } },
  }, { registerPanel(_options, component) { Panel = component } })
  t.after(() => effects.reverse().forEach(release => typeof release === 'function' && release()))
  const model = sample('GroundVehicles/Test/Test', 'GroundVehicles', 'Test')
  await act(async () => root.render(React.createElement(Panel, { snapshot: { models: [model], indexedAt: '2026-11-25', sourceUrl: 'https://savage.nps.edu/Savage/' } })))
  const button = document.querySelector('article button[aria-label^="下载"]')
  await act(async () => button.click())
  assert.deepEqual(calls[0], { channel: '/dsh-models', endpoint: 'download', payload: { modelId: model.id, workspaceId: 'current' } })
  assert.match(document.querySelector('article [role="status"]').textContent, /D:\/workspace\/models/)
  workspaceId = undefined; reject = true
  await act(async () => button.click())
  assert.deepEqual(calls[1].payload, { modelId: model.id })
  assert.match(document.querySelector('[role="alert"]').textContent, /请选择工作区/)
  assert.equal(button.disabled, false)
})

test('大类页签、来源、子类与搜索联动，上层切换清理筛选并支持方向键', async t => {
  const { loaded, root } = browser(t)
  const item = (id, domain, sourceId, category) => ({ ...sample(id, category, id), domain, sourceId })
  const snapshot = { indexedAt: '2026-11-25', models: [item('chair', 'home', 'kenney', 'seating'), item('desk', 'home', 'kenney', 'tables'),
    item('kay-chair', 'home', 'kaykit-furniture', 'seating'), item('laptop', 'devices', 'kenney', 'electronics'), item('satellite', 'equipment', 'nasa', 'spacecraft'), item('duck', 'misc', 'khronos', 'animals')] }
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, { snapshot })))
  assert.equal(document.querySelector('h1').textContent, '资产库')
  assert.equal(document.querySelectorAll('[role="tab"]').length, 4)
  assert.equal(document.querySelectorAll('article').length, 3)
  const [source, category] = document.querySelectorAll('select')
  await act(async () => Simulate.change(source, { target: { value: 'kenney' } }))
  await act(async () => Simulate.change(category, { target: { value: 'seating' } }))
  assert.equal(document.querySelectorAll('article').length, 1)
  const tabs = document.querySelectorAll('[role="tab"]')
  await act(async () => tabs[1].click())
  assert.equal(source.value, ''); assert.equal(category.value, '')
  assert.match(document.querySelector('article h2').textContent, /laptop/)
  await act(async () => Simulate.keyDown(tabs[1], { key: 'ArrowRight' }))
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true')
  assert.equal(document.activeElement, tabs[2])
  assert.match(document.querySelector('article h2').textContent, /satellite/)
  await act(async () => Simulate.change(document.querySelector('input'), { target: { value: 'none-exists' } }))
  assert.match(document.body.textContent, /没有找到匹配/)
  await act(async () => tabs[3].click())
  assert.equal(document.querySelector('input').value, '')
  assert.match(document.querySelector('article h2').textContent, /duck/)
})

test('使用进入本地浏览器等待页，返回保留筛选并取消任务，迟到的任务也释放', async t => {
  const { loaded, root } = browser(t)
  const cancelled = [], model = sample('GroundVehicles/Test/Test', 'GroundVehicles', 'Test')
  let release
  const response = new Promise(resolve => { release = resolve })
  const props = { snapshot: { models: [model], indexedAt: '2026-11-25' }, useModel: () => response,
    getUseStatus: async () => ({ id: 'job', phase: 'ready', viewerUrl: 'http://127.0.0.1:1234/v/token/' }),
    cancelUse: async id => { cancelled.push(id) } }
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, props)))
  await act(async () => Simulate.change(document.querySelector('input'), { target: { value: 'Test' } }))
  await act(async () => document.querySelector('button[aria-label="使用 Test"]').click())
  assert.equal(document.querySelector('main h1').textContent, 'Test')
  await act(async () => release({ id: 'job', phase: 'downloading', viewerUrl: 'http://127.0.0.1:1234/v/token/' }))
  assert.match(document.querySelector('iframe').src, /^http:\/\/127\.0\.0\.1:/)
  await act(async () => document.querySelector('main header button').click())
  assert.equal(document.querySelector('input').value, 'Test'); assert.deepEqual(cancelled, ['job'])

  let late
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, { ...props, useModel: () => new Promise(resolve => { late = resolve }) })))
  await act(async () => document.querySelector('button[aria-label="使用 Test"]').click())
  await act(async () => document.querySelector('main header button').click())
  await act(async () => late({ id: 'late', phase: 'queued', viewerUrl: 'http://127.0.0.1:1234/v/late/' }))
  assert.ok(cancelled.includes('late'))
})
