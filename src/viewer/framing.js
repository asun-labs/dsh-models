import { Box3, Vector3 } from 'three'

/** 保留整个场景；仅在远处辅助对象使主体过小时选择更合适的初始取景。 */
export function framingBounds(object) {
  const all = new Box3().setFromObject(object)
  let largest, largestSize = 0
  object.traverseVisible(node => {
    if (!node.isMesh || !node.geometry?.attributes.position?.count) return
    const box = new Box3().setFromObject(node), size = box.getSize(new Vector3())
    const dimension = Math.max(size.x, size.y, size.z)
    if (dimension > largestSize) { largest = box; largestSize = dimension }
  })
  const size = all.getSize(new Vector3())
  const focused = largestSize > 0 && Math.max(size.x, size.y, size.z) > largestSize * 8
  return { all, subject: focused ? largest : all, focused }
}
