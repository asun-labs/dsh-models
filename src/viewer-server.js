import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative, isAbsolute } from 'node:path'

export async function createViewerServer({ findJob, snapshot, viewerRoot = fileURLToPath(new URL('./viewer/', import.meta.url)) }) {
  let origin
  const staticFiles = { 'viewer.js': 'text/javascript', 'viewer.css': 'text/css' }
  const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'")
    try {
      if (request.headers.host !== new URL(origin).host) { json(response, 403, { error: '无效 Host' }); return }
      const path = new URL(request.url, origin).pathname
      const staticName = path.startsWith('/static/') ? path.slice(8) : ''
      if (request.method === 'GET' && staticFiles[staticName]) {
        response.writeHead(200, { 'Content-Type': staticFiles[staticName] }); response.end(await readFile(join(viewerRoot, staticName))); return
      }
      const match = /^\/v\/([A-Za-z0-9_-]{32})\/(|status|model|state|texture\/[a-f0-9]{32})$/.exec(path)
      const job = match && findJob(match[1])
      if (!job || job.phase === 'cancelled') { json(response, 404, { error: '查看器任务已关闭或失效。' }); return }
      const route = match[2]
      if (request.method === 'GET' && route === '') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(await readFile(join(viewerRoot, 'index.html'))); return
      }
      if (request.method === 'GET' && route === 'status') { json(response, 200, snapshot(job)); return }
      if (request.method === 'POST' && route === 'state') {
        if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') { json(response, 403, { error: '无效来源' }); return }
        let size = 0; const chunks = []
        for await (const chunk of request) { size += chunk.length; if (size > 8192) throw new Error('状态数据超限'); chunks.push(chunk) }
        const state = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (state.phase === 'cancelled') {
          job.controller.abort(); job.phase = 'cancelled'; job.error = '查看器已关闭。'
          json(response, 200, { ok: true }); return
        }
        if (!['loading', 'ready', 'error'].includes(state.phase) || !['downloaded', 'loading', 'ready'].includes(job.phase)) {
          json(response, 409, { error: '阶段无效' }); return
        }
        if (state.phase === 'ready' && (!Number.isSafeInteger(state.meshes) || state.meshes < 1 || state.meshes > 1000000)) {
          json(response, 400, { error: '未确认实际模型几何。' }); return
        }
        job.phase = state.phase
        if (state.phase === 'error') job.error = String(state.message ?? '模型加载失败。').slice(0, 1000)
        if (state.phase === 'ready') job.metrics = { meshes: state.meshes, triangles: Math.max(0, Math.min(Number(state.triangles) || 0, 1e10)) }
        json(response, 200, { ok: true }); return
      }
      const texture = route.startsWith('texture/') ? job.resources?.[route.slice(8)] : undefined
      if (request.method === 'GET' && ((route === 'model' && job.result) || texture)) {
        const file = await realpath(texture?.path ?? job.result.path)
        const offset = relative(job.workspaceRoot, file)
        if (isAbsolute(offset) || offset === '..' || offset.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('模型文件已移出工作区。')
        const info = await stat(file)
        if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error('模型文件不可用或超限。')
        response.writeHead(200, { 'Content-Type': texture?.contentType ?? (job.result.format === 'VRML' ? 'model/vrml' : 'model/gltf-binary'), 'Content-Length': info.size })
        const stream = createReadStream(file)
        stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response); return
      }
      json(response, 404, { error: '没有该资源。' })
    } catch (error) {
      if (response.headersSent) response.destroy()
      else json(response, 400, { error: error.message })
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  let closing
  return { origin, close() { return closing ??= new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) } }
}
