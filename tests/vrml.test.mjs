import assert from 'node:assert/strict'
import test from 'node:test'
import { staticVrml } from '../src/vrml-static.js'
import { findVrmlUrl } from '../src/preview-source.js'
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js'
import { Box3, Vector3 } from 'three'

test('静态 VRML 忽略 ROUTE，保留注释与字符串，拒绝不能完整显示的原型和外部场景', () => {
  const text = '#VRML V2.0 utf8\n# PROTO example\nTransform { children [ Shape { geometry Box {} } ] ROUTE sensor.rotation TO body.rotation }\nWorldInfo { info ["Inline { and PROTO x and ROUTE a.b TO c.d"] }'
  const value = staticVrml(text)
  assert.ok(value.includes('# PROTO example'))
  assert.ok(value.includes('"Inline { and PROTO x and ROUTE a.b TO c.d"'))
  assert.equal(value.includes('ROUTE sensor.rotation'), false)
  assert.throws(() => staticVrml('DEF scene Inline { url "part.wrl" }'), /Inline\/PROTO/)
  assert.throws(() => staticVrml('PROTO Chair [] { Shape {} }'), /Inline\/PROTO/)
})

test('只读取详情页给出的同源对应 VRML 文件，不猜测地址或接受外域', () => {
  const model = { sourcePage: 'https://savage.nps.edu/Savage/ShipsMilitary/Test/TestIndex.html', modelUrl: 'https://savage.nps.edu/Savage/ShipsMilitary/Test/Test.x3d' }
  assert.equal(findVrmlUrl('<a href="Other.wrl">other</a><a href="Test.wrl">VRML</a>', model), 'https://savage.nps.edu/Savage/ShipsMilitary/Test/Test.wrl')
  assert.throws(() => findVrmlUrl('<a href="https://evil.test/Test.wrl">other</a>', model), /未提供对应/)
  assert.throws(() => findVrmlUrl('<a href="../../../Test.wrl">other</a>', model), /未提供对应/)
})

test('自动取景不包含场景天空球，只有背景的文件不能冒充有效模型', () => {
  const sky = '#VRML V2.0 utf8\nBackground { skyColor [0.1 0.2 0.3] groundColor [0.2 0.3 0.1] }'
  const scene = new VRMLLoader().parse(staticVrml(sky + '\nShape { geometry Box { size 2 2 2 } }'), '')
  let meshes = 0; scene.traverse(node => { if (node.isMesh) meshes++ })
  assert.equal(meshes, 1)
  assert.deepEqual(new Box3().setFromObject(scene).getSize(new Vector3()).toArray(), [2, 2, 2])
  const background = new VRMLLoader().parse(staticVrml(sky), '')
  let emptyMeshes = 0; background.traverse(node => { if (node.isMesh) emptyMeshes++ })
  assert.equal(emptyMeshes, 0)
})
