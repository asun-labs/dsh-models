import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { categories, categoryLabels, filterModels } from '../src/catalog.js'

const catalog = JSON.parse(readFileSync(new URL('../src/savage-catalog.json', import.meta.url), 'utf8'))

test('真实 SAVAGE 索引保留唯一标识、官方详情与 X3D URL', () => {
  assert.ok(catalog.models.length > 1000)
  assert.equal(new Set(catalog.models.map(model => model.id)).size, catalog.models.length)
  for (const model of catalog.models) {
    assert.ok(model.name)
    assert.ok(categoryLabels[model.category], model.category)
    for (const key of ['sourcePage', 'licenseUrl', ...(model.modelUrl ? ['modelUrl'] : []), ...(model.thumbnailUrl ? ['thumbnailUrl'] : [])]) {
      const url = new URL(model[key])
      assert.equal(url.origin, 'https://savage.nps.edu')
      assert.ok(url.pathname.startsWith('/Savage/'))
    }
    if (model.modelUrl) assert.match(model.modelUrl, /\.x3d$/)
    else assert.match(model.downloadUnavailable, /HTTP (403|404)/)
  }
  assert.equal(categories(catalog.models).reduce((total, category) => total + category.count, 0), catalog.models.length)
})

test('F-16、坦克、航母和卫星可检索，分类与搜索取交集', () => {
  assert.ok(filterModels(catalog.models, 'AircraftFixedWing', 'F-16').some(model => model.id.endsWith('/F16')))
  assert.ok(filterModels(catalog.models, 'GroundVehicles', 'M1A1').length)
  assert.ok(filterModels(catalog.models, 'Space', 'Radarsat').length)
  assert.equal(filterModels(catalog.models, 'Space', 'M1A1').length, 0)
  const nimitz = catalog.models.find(model => model.id === 'ShipsMilitary/CarrierNimitzUnitedStates/NimitzCVN')
  assert.ok(nimitz)
  assert.equal(nimitz.thumbnailUrl, null)
})
