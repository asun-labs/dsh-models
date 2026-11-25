import { constants } from 'node:fs'
import { copyFile, mkdir, realpath, rm, stat, open } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { basename, extname, isAbsolute, join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export class DownloadError extends Error {
  constructor(message, code = 'downloadFailed') { super(message); this.code = code }
}

function inside(root, path) {
  const offset = relative(root, path)
  return !isAbsolute(offset) && offset !== '..' && !offset.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
}

export async function modelDirectory(workspacePath, modelId, source = 'SAVAGE') {
  if (!isAbsolute(workspacePath)) throw new DownloadError('工作区路径无效，请重新选择工作区。')
  const root = await realpath(workspacePath)
  const parts = [source, ...modelId.split('/').slice(0, -1)]
  if (parts.some(part => !/^[A-Za-z0-9._-]+$/.test(part) || part === '.' || part === '..')) throw new DownloadError('模型目录无效。')
  let directory = root
  for (const part of ['models', ...parts]) {
    const next = join(directory, part)
    try { await mkdir(next) } catch (error) { if (error.code !== 'EEXIST') throw error }
    directory = await realpath(next)
    if (!inside(root, directory) || !(await stat(directory)).isDirectory()) throw new DownloadError('模型保存目录超出工作区，或不是文件夹。')
  }
  return directory
}

async function publishFile(temporary, directory, filename) {
  const extension = extname(filename), stem = basename(filename, extension)
  for (let number = 0; number < 1000; number++) {
    const target = join(directory, number ? `${stem} (${number + 1})${extension}` : filename)
    try { await copyFile(temporary, target, constants.COPYFILE_EXCL); return target }
    catch (error) { if (error.code !== 'EEXIST') throw error }
  }
  throw new DownloadError('同名文件过多，请清理下载目录后重试。')
}

export async function saveModel(model, workspace, { fetchImpl = fetch, signal, maxBytes = 256 * 1024 * 1024, onProgress = () => {} } = {}) {
  if (!model.modelUrl) throw new DownloadError('源站暂未提供可用下载地址。', 'downloadUnavailable')
  const url = new URL(model.modelUrl)
  const format = model.format ?? 'X3D'
  const imageExtensions = { PNG: /\.png$/i, JPEG: /\.jpe?g$/i, WEBP: /\.webp$/i, GIF: /\.gif$/i, BMP: /\.bmp$/i }
  const image = imageExtensions[format]?.test(url.pathname)
  const savage = url.origin === 'https://savage.nps.edu' && url.pathname.startsWith('/Savage/')
    && ((url.pathname.endsWith('.x3d') && format === 'X3D') || (url.pathname.endsWith('.wrl') && format === 'VRML') || image)
  const github = url.origin === 'https://raw.githubusercontent.com' && /^\/(?:nasa\/NASA-3D-Resources|yuyou-dev\/OpenHome3D|KhronosGroup\/glTF-Sample-Assets)\/[a-f0-9]{40}\//.test(url.pathname) && url.pathname.endsWith('.glb') && format === 'GLB'
  if (!savage && !github) throw new DownloadError('模型下载地址无效。')
  const filename = decodeURIComponent(url.pathname.split('/').at(-1))
  if (!filename || /[<>:"/\\|?*\x00-\x1f]/.test(filename)) throw new DownloadError('模型文件名无效。')
  signal?.throwIfAborted()
  const response = await fetchImpl(url.href, { signal, redirect: 'error' })
  if (!response.ok) throw new DownloadError(`源站下载失败（HTTP ${response.status}），可稍后重试。`)
  if (!response.body) throw new DownloadError('源站未返回模型内容。')
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) { await response.body.cancel(); throw new DownloadError(`资源文件超过 ${maxBytes / 1048576} MB 下载上限。`) }
  const total = declared > 0 && !response.headers.get('content-encoding') ? declared : null
  onProgress({ received: 0, total, filename })
  const directory = await modelDirectory(workspace.path, model.id, savage ? 'SAVAGE' : 'GitHub')
  const temporary = join(directory, `.dsh-models-${randomUUID()}.partial`)
  let bytes = 0, prefix = Buffer.alloc(0), mediaType
  const meter = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length
    if (bytes > maxBytes) { done(new DownloadError(`资源文件超过 ${maxBytes / 1048576} MB 下载上限。`)); return }
    if (prefix.length < 65536) prefix = Buffer.concat([prefix, chunk.subarray(0, 65536 - prefix.length)])
    onProgress({ received: bytes, total, filename })
    done(null, chunk)
  } })
  try {
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary, { flags: 'wx' }), { signal })
    if (format === 'X3D') {
      const xml = prefix.toString('utf8').replace(/^\uFEFF/, '').replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g, '').trimStart()
      if (!/^<X3D(?:\s|>)/.test(xml)) throw new DownloadError('下载内容不是有效的 X3D 模型，未保存。')
    } else if (format === 'VRML') {
      if (!/^#VRML V2\.0 utf8/.test(prefix.toString('utf8'))) throw new DownloadError('源站预览不是 VRML97 文件，未保存。')
    } else if (image) {
      // 旧源站有后缀与实际编码不一致的图片；按安全位图文件头识别，不按扩展名猜 MIME。
      mediaType = prefix.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
        : prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 ? 'image/jpeg'
          : prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
            : /^GIF8[79]a/.test(prefix.toString('ascii', 0, 6)) ? 'image/gif' : prefix.toString('ascii', 0, 2) === 'BM' ? 'image/bmp' : undefined
      if (!mediaType) throw new DownloadError('来源图片不是支持的安全位图，未保存。')
    } else if (prefix.length < 12 || prefix.toString('ascii', 0, 4) !== 'glTF' || prefix.readUInt32LE(4) !== 2 || prefix.readUInt32LE(8) !== bytes) {
      throw new DownloadError('下载内容不是完整的 GLB 2.0 模型，未保存。')
    }
    signal?.throwIfAborted()
    const path = await publishFile(temporary, directory, filename)
    // 署名和许可随实际下载文件保留，后续再分发时仍可追溯原始来源。
    let metadata
    try {
      metadata = await open(path + '.source.json', 'wx')
      await metadata.writeFile(JSON.stringify({ name: model.name, sourcePage: model.sourcePage, originalSourceUrl: model.originalSourceUrl,
        modelUrl: model.modelUrl, sourceCommit: model.sourceCommit, author: model.author, license: model.license,
        licenseUrl: model.licenseUrl, attribution: model.attribution, usageNotes: model.usageNotes, mediaType }, null, 2) + '\n')
      await metadata.close()
    } catch (error) {
      if (metadata) { await metadata.close(); await rm(path + '.source.json', { force: true }) }
      await rm(path, { force: true }); throw error
    }
    onProgress({ received: bytes, total: bytes, filename: basename(path), complete: true })
    return { path, bytes, filename: basename(path), workspaceId: workspace.workspaceId ?? workspace.id, workspaceTitle: workspace.title, ...(mediaType ? { mediaType } : {}) }
  } finally {
    await rm(temporary, { force: true })
  }
}
