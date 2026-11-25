import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { staticVrml } from '../vrml-static.js'
import { framingBounds } from './framing.js'

const element = id => document.getElementById(id)
const base = new URL('./', location.href)
const labels = { queued: '等待下载', downloading: '下载原始模型', 'resolving-preview': '查找源站预览', 'downloading-preview': '下载静态预览',
  downloaded: '下载完成', loading: '加载模型', ready: '已加载', error: '加载失败', cancelled: '已取消' }
const controller = new AbortController()
let opening = false, disposed = false, timer, renderer, scene, controls, resize, animation, environment, mixer
const bytes = value => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`
function phase(value, message) {
  document.body.dataset.phase = value
  element('phase').textContent = labels[value] ?? value
  element('message').textContent = message ?? labels[value] ?? value
}
function progress(received, total, filename = '') {
  if (total > 0) { element('progress').max = total; element('progress').value = received }
  else element('progress').removeAttribute('value')
  const prefix = filename ? `${filename} · ` : ''
  element('bytes').textContent = prefix + (total > 0 ? `${bytes(received)} / ${bytes(total)} · ${Math.min(100, Math.floor(received / total * 100))}%` : `${bytes(received)} · 总大小未知`)
}
async function report(value) {
  const response = await fetch(new URL('state', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: controller.signal })
  if (!response.ok) throw new Error('查看器状态未能同步，任务可能已关闭。')
}
async function modelBytes() {
  const response = await fetch(new URL('model', base), { signal: controller.signal })
  if (!response.ok) throw new Error('本地模型读取失败，任务可能已关闭。')
  const total = Number(response.headers.get('content-length')) || null
  const reader = response.body.getReader(), chunks = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); received += value.length; progress(received, total)
    }
  } finally { await reader.cancel() }
  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
  return buffer.buffer
}
async function open(job) {
  opening = true
  await report({ phase: 'loading' })
  phase('loading', '读取本地模型…')
  const data = await modelBytes()
  phase('loading', '解析模型与材质…')
  element('progress').removeAttribute('value'); element('bytes').textContent = '解析中，完成后自动进入查看器'
  // 让浏览器先绘制真实阶段，再进入同步解析；不伪造解析百分比。
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const manager = new THREE.LoadingManager(), failures = []
  let resourceLoaded = 0, resourceTotal = 0, resourceDone
  manager.onStart = (_url, loaded, total) => { resourceLoaded = loaded; resourceTotal = total }
  manager.onProgress = (_url, loaded, total) => {
    resourceLoaded = loaded; resourceTotal = total
    element('bytes').textContent = `材质资源：${loaded} / ${total}`
    if (loaded === total) resourceDone?.()
  }
  manager.onError = url => failures.push(url)
  manager.setURLModifier(url => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    const resolved = new URL(url, base)
    if (resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname + 'texture/') && /^[a-f0-9]{32}$/.test(resolved.pathname.slice((base.pathname + 'texture/').length))) return resolved.href
    throw new Error('模型引用了未包含在文件中的外部纹理或部件，当前不能完整加载。请查看原始来源。')
  })
  let object, clips = []
  if (job.result.format === 'VRML') {
    const text = staticVrml(new TextDecoder().decode(data))
    object = new VRMLLoader(manager).parse(text, base.href)
  } else {
    const gltf = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(data, base.href)
    object = gltf.scene; clips = gltf.animations
  }
  if (resourceLoaded < resourceTotal) await new Promise(resolve => { resourceDone = resolve })
  if (failures.length) throw new Error('模型依赖读取失败，不能确认完整加载。')
  let meshes = 0, triangles = 0
  object.traverseVisible(node => {
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    if (node.isMesh && node.geometry?.attributes.position?.count > 0 && materials.some(material => material?.visible && material.opacity > 0)) {
      meshes++; triangles += Math.floor((node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3)
    }
  })
  if (!meshes) throw new Error('文件未加载出可显示的模型几何，不能进入已完成状态。')
  if (disposed) return
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor('#141b28')
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15
  element('stage').append(renderer.domElement)
  scene = new THREE.Scene()
  const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer)
  environment = generator.fromScene(room).texture; scene.environment = environment
  generator.dispose(); room.dispose()
  scene.add(new THREE.HemisphereLight(0xeef5ff, 0x505a76, 2))
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(4, 8, 6); scene.add(sun)
  const bounds = framingBounds(object), size = bounds.subject.getSize(new THREE.Vector3()), center = bounds.subject.getCenter(new THREE.Vector3())
  const dimension = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(dimension) || dimension <= 0) throw new Error('模型包围盒无效。')
  object.position.sub(center); scene.add(object)
  const offset = center.clone().negate()
  const subjectBox = bounds.subject.clone().translate(offset), allBox = bounds.all.clone().translate(offset)
  const grid = new THREE.GridHelper(dimension * 3, 24, 0x596681, 0x2e3a51); grid.position.y = -size.y / 2; scene.add(grid)
  const camera = new THREE.PerspectiveCamera(42, 1, dimension / 10000, dimension * 10000)
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
  function fit(whole = false) {
    const box = whole ? allBox : subjectBox, target = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3())
    const chosen = Math.max(extent.x, extent.y, extent.z)
    const distance = chosen / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.5 / Math.min(1, camera.aspect)
    camera.near = chosen / 10000; camera.far = chosen * 10000; camera.updateProjectionMatrix()
    camera.position.copy(target).add(new THREE.Vector3(distance * .85, distance * .55, distance * .85)); controls.target.copy(target); controls.update()
    grid.scale.setScalar(chosen / dimension); grid.position.set(target.x, box.min.y, target.z)
  }
  function layout() {
    const { clientWidth: width, clientHeight: height } = element('stage')
    if (!width || !height) return
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix()
  }
  layout(); fit(); resize = new ResizeObserver(layout); resize.observe(element('stage'))
  element('reset').onclick = () => fit()
  element('all').hidden = !bounds.focused; element('all').onclick = () => fit(true)
  if (clips.length) { mixer = new THREE.AnimationMixer(object); for (const clip of clips) mixer.clipAction(clip).play() }
  const clock = new THREE.Clock()
  function render() { if (disposed) return; mixer?.update(clock.getDelta()); controls.update(); renderer.render(scene, camera); animation = requestAnimationFrame(render) }
  render()
  await new Promise(resolve => requestAnimationFrame(resolve))
  await report({ phase: 'ready', meshes, triangles })
  phase('ready'); element('waiting').hidden = true; element('tools').hidden = false
  element('details').textContent = `${job.model.author ?? ''} · ${job.model.license ?? ''} · ${meshes} 个网格 · ${triangles.toLocaleString()} 个三角形`
  if (bounds.focused) element('details').textContent += ' · 默认聚焦主体，可切换完整场景查看远处对象'
  renderer.domElement.dataset.meshes = meshes
}
async function tick() {
  try {
    const response = await fetch(new URL('status', base), { signal: controller.signal })
    if (!response.ok) throw new Error('使用任务已关闭或失效，请返回资产库重试。')
    const job = await response.json()
    element('name').textContent = job.model.name
    element('source').href = job.model.sourcePage; element('license').href = job.model.licenseUrl
    element('warnings').textContent = job.warnings.join(' ')
    element('path').textContent = job.result?.path ?? ''
    if (!opening) {
      phase(job.phase)
      if (job.progress) progress(job.progress.received, job.progress.total, job.progress.filename)
      else { element('progress').removeAttribute('value'); element('bytes').textContent = '' }
    }
    if (['error', 'cancelled'].includes(job.phase)) throw new Error(job.error ?? labels[job.phase])
    if (job.phase === 'downloaded' && !opening) await open(job)
    if (!disposed) timer = setTimeout(tick, document.body.dataset.phase === 'ready' ? 1500 : 300)
  } catch (error) {
    if (disposed) return
    phase('error'); element('waiting').hidden = false; element('error').textContent = error.message
    element('progress').hidden = true; element('bytes').textContent = '已下载文件保留，可返回后重试。'
    try { await report({ phase: 'error', message: error.message }) } catch { /* 任务失效时保留原始错误。 */ }
    dispose()
  }
}
function dispose() {
  disposed = true; controller.abort(); clearTimeout(timer); cancelAnimationFrame(animation); resize?.disconnect(); controls?.dispose(); mixer?.stopAllAction()
  scene?.traverse(object => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    if (!material) continue
    for (const value of Object.values(material)) if (value?.isTexture) value.dispose()
    material.dispose()
  } })
  environment?.dispose(); renderer?.dispose(); renderer?.forceContextLoss()
}
addEventListener('pagehide', () => {
  if (!disposed) {
    try { navigator.sendBeacon(new URL('state', base), new Blob([JSON.stringify({ phase: 'cancelled' })], { type: 'application/json' })) } catch { /* 页面已离开时不阻塞关闭。 */ }
  }
  dispose()
}, { once: true })
tick()
