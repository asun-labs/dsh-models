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
  const select = document.querySelector('select')
  await act(async () => Simulate.change(select, { target: { value: 'GroundVehicles' } }))
  assert.equal(document.querySelectorAll('article').length, 1)
  assert.match(document.querySelector('article').textContent, /M1A1.*暂无截图|暂无截图.*M1A1/)
  assert.equal(button('上一页').disabled, true)
  assert.equal(document.querySelector('article a[aria-label^="下载"]').href, snapshot.models[25].modelUrl)
  await act(async () => button('清除筛选').click())
  const input = document.querySelector('input[type="search"]')
  await act(async () => Simulate.change(input, { target: { value: 'F-16' } }))
  assert.match(document.querySelector('[role="status"]').textContent, /25 条资源/)
  const image = document.querySelector('article img')
  await act(async () => Simulate.error(image))
  assert.match(document.querySelector('article').textContent, /暂无截图/)
  assert.equal(document.querySelectorAll('article a').length, 48)
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
  assert.equal(entries[1].options.label, '模型库')
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
  assert.equal(panels[0].Panel, loaded.ModelsPanel)
  for (const release of effects.reverse()) release?.()
})

test('源站拒绝的条目显示下载不可用并保留详情入口', async t => {
  const { loaded, root } = browser(t)
  const model = { ...sample('AircraftHelicopters/Example', 'AircraftHelicopters', 'Example'), modelUrl: null, downloadUnavailable: '来源详情返回 HTTP 403' }
  await act(async () => root.render(React.createElement(loaded.ModelsPanel, { snapshot: {
    sourceUrl: 'https://savage.nps.edu/Savage/', indexedAt: '2026-11-25T00:00:00Z', models: [model],
  } })))
  assert.equal(document.querySelectorAll('article a').length, 1)
  assert.equal(document.querySelector('article a').href, model.sourcePage)
  assert.match(document.querySelector('article').textContent, /下载暂不可用/)
})
