import assert from 'node:assert/strict'
import test from 'node:test'
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { framingBounds } from '../src/viewer/framing.js'

test('普通组合模型按完整尺寸取景，远处辅助对象不会把主体缩成一个点', () => {
  const group = new Group(), material = new MeshBasicMaterial()
  const primary = new Mesh(new BoxGeometry(4, 2, 6), material), helper = new Mesh(new BoxGeometry(.5, .5, .5), material)
  helper.position.x = 3; group.add(primary, helper)
  assert.equal(framingBounds(group).focused, false)
  helper.position.x = 1000
  const result = framingBounds(group)
  assert.equal(result.focused, true)
  assert.ok(result.all.max.x > 1000); assert.equal(result.subject.max.x, 2)
  assert.equal(group.children.length, 2)
  primary.geometry.dispose(); helper.geometry.dispose(); material.dispose()
})
