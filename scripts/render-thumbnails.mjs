import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

if (process.argv.includes('--help')) {
  console.log('从已索引的 CC0 GLB 渲染家具/设备缩略图，不分发模型文件。\n示例：node scripts/render-thumbnails.mjs\n缓存位于 .build/thumbnail-models；输出 src/thumbnails.json（PNG data URL）。')
  process.exit(0)
}
const root = resolve(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(join(root, 'src/github-catalog.json'), 'utf8'))
const entries = catalog.models.filter(model => ['kenney', 'kaykit-furniture', 'kaykit-restaurant'].includes(model.sourceId))
const cache = join(root, '.build/thumbnail-models')
await mkdir(cache, { recursive: true })
const modelFile = model => join(cache, createHash('sha256').update(model.modelUrl).digest('hex') + '.glb')
for (let offset = 0; offset < entries.length; offset += 8) {
  await Promise.all(entries.slice(offset, offset + 8).map(async model => {
    const path = modelFile(model)
    try { await stat(path); return } catch (error) { if (error.code !== 'ENOENT') throw error }
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(model.modelUrl, { signal: AbortSignal.timeout(45000), redirect: 'error' })
        if (!response.ok) throw new Error(`${model.id}: HTTP ${response.status}`)
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${model.id}: 非 GLB`)
        await writeFile(path, bytes); break
      } catch (error) { if (attempt === 2) throw error }
    }
  }))
}
console.log(`已缓存 ${entries.length} 个 CC0 GLB，开始无头渲染。`)
const byId = new Map(entries.map(model => [model.id, modelFile(model)]))
const threeRoot = join(root, 'node_modules/three')
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let file
    if (pathname.startsWith('/three/')) {
      file = resolve(threeRoot, pathname.slice(7))
      const offset = relative(threeRoot, file)
      if (isAbsolute(offset) || offset.startsWith('..')) throw new Error('路径越界')
    } else if (pathname.startsWith('/model/')) file = byId.get(pathname.slice(7))
    else if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(`<html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from '/three/examples/jsm/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,200);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;document.body.append(renderer.domElement);
window.capture=async id=>{const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x8793a2,2.5));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(3,6,5);scene.add(sun);
const gltf=await new GLTFLoader().loadAsync('/model/'+encodeURIComponent(id));const object=gltf.scene;scene.add(object);
const box=new THREE.Box3().setFromObject(object);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const scale=2/Math.max(size.x,size.y,size.z);object.scale.multiplyScalar(scale);object.position.sub(center.multiplyScalar(scale));
const camera=new THREE.OrthographicCamera(-1.65,1.65,1.29,-1.29,.1,50);camera.position.set(3,2.3,3);camera.lookAt(0,0,0);renderer.render(scene,camera);const result=renderer.domElement.toDataURL('image/png');scene.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose()}});return result};
</script></body></html>`)
      return
    }
    if (!file) { response.writeHead(404); response.end(); return }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'model/gltf-binary')
    response.end(await readFile(file))
  } catch { response.writeHead(500); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => typeof window.capture === 'function')
  const result = {}
  for (const [index, model] of entries.entries()) {
    result[model.id] = await page.evaluate(id => window.capture(id), model.id)
    if ((index + 1) % 50 === 0) console.log(`已渲染 ${index + 1}/${entries.length}`)
  }
  await writeFile(join(root, 'src/thumbnails.json'), JSON.stringify(result) + '\n')
  console.log(`完成：${entries.length} 张原模型缩略图，原作者与 CC0 许可见 github-catalog/third-party。`)
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
