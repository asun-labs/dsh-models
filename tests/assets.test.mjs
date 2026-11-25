import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assetCatalog, domains, filterAssets, sources } from '../src/asset-catalog.js'
import { categoryLabels } from '../src/catalog.js'

test('四大类包含真实资产，保留 SAVAGE，NASA 来源与子类可以求交集', () => {
  assert.equal(assetCatalog.models.length, 1841)
  assert.equal(filterAssets(assetCatalog.models, { sourceId: 'savage' }).length, 1233)
  assert.equal(filterAssets(assetCatalog.models, { sourceId: 'nasa' }).length, 256)
  for (const domain of domains) assert.ok(filterAssets(assetCatalog.models, { domain: domain.id }).length > 0)
  const nasa = filterAssets(assetCatalog.models, { domain: 'equipment', sourceId: 'nasa', category: 'spacecraft' })
  assert.ok(nasa.length > 0); assert.ok(nasa.every(model => model.sourceId === 'nasa' && model.category === 'spacecraft'))
  assert.equal(filterAssets(assetCatalog.models, { domain: 'home', sourceId: 'nasa' }).length, 0)
  assert.ok(filterAssets(assetCatalog.models, { domain: 'devices', query: 'laptop' }).length)
  assert.ok(filterAssets(assetCatalog.models, { domain: 'devices', query: '电脑' }).length)
})

test('索引 URL 固定真实来源和版本，每项保留作者、逐项许可与归属', () => {
  assert.equal(new Set(assetCatalog.models.map(model => model.id)).size, assetCatalog.models.length)
  for (const model of assetCatalog.models) {
    assert.ok(sources[model.sourceId]); assert.ok(categoryLabels[model.category], model.category)
    for (const field of ['author', 'license', 'licenseUrl', 'sourcePage', 'attribution', 'usageNotes']) assert.ok(model[field], `${model.id}: ${field}`)
    if (model.sourceId === 'savage') continue
    assert.match(model.sourceCommit, /^[a-f0-9]{40}$/)
    assert.equal(new URL(model.modelUrl).hostname, 'raw.githubusercontent.com')
    assert.ok(model.modelUrl.includes('/' + model.sourceCommit + '/'))
    if (model.sourceId === 'khronos') assert.match(model.license, /^(CC0-1.0|CC-BY-4.0)( \/ (CC0-1.0|CC-BY-4.0))*$/)
    if (model.sourceId.startsWith('kaykit') || model.sourceId === 'kenney') {
      assert.equal(model.license, 'CC0-1.0'); assert.ok(model.originalSourceUrl)
    }
  }
})

test('家具和设备缩略图来自对应的 CC0 资产，无冒充单模型的资源包截图', () => {
  const thumbnails = JSON.parse(readFileSync(new URL('../src/thumbnails.json', import.meta.url), 'utf8'))
  const models = assetCatalog.models.filter(model => model.sourceId.startsWith('kaykit') || model.sourceId === 'kenney')
  assert.equal(models.length, 337)
  for (const model of models) assert.match(thumbnails[model.id], /^data:image\/png;base64,/, model.id)
  assert.ok(new Set(Object.values(thumbnails)).size > 200)
})
