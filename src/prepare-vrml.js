import { readFile, open, rm } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { saveModel, DownloadError } from './download.js'

function tokens(text) {
  return [...text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|#[^\r\n]*|[{}\[\]]|[^\s,{}\[\]"]+/g)]
    .filter(match => !match[0].startsWith('#')).map(match => ({ value: match[0], start: match.index, end: match.index + match[0].length }))
}
function nodeBlocks(text, kind = 'Inline') {
  const list = tokens(text), blocks = []
  for (let i = 0; i < list.length; i++) {
    if (list[i].value !== kind || list[i + 1]?.value !== '{') continue
    let depth = 1, end = i + 2
    for (; end < list.length && depth; end++) { if (list[end].value === '{') depth++; if (list[end].value === '}') depth-- }
    if (depth) throw new DownloadError('VRML Inline 结构不完整。')
    const node = list.slice(i + 2, end - 1), position = node.findIndex(token => token.value === 'url')
    if (position < 0) throw new DownloadError('VRML Inline 缺少实际资源地址。')
    const values = node[position + 1]?.value === '[' ? node.slice(position + 2, node.findIndex((token, index) => index > position && token.value === ']')) : node.slice(position + 1, position + 2)
    const urls = values.filter(token => token.value.startsWith('"')).map(token => token.value.slice(1, -1).replace(/\\(["\\])/g, '$1'))
    const valueStart = node[position + 1]
    const valueEnd = valueStart?.value === '[' ? node[node.findIndex((token, index) => index > position && token.value === ']')] : valueStart
    if (!valueEnd) throw new DownloadError('VRML 资源地址不完整。')
    blocks.push({ start: list[i].start, end: list[end - 1].end, urls, urlStart: valueStart.start, urlEnd: valueEnd.end }); i = end - 1
  }
  return blocks
}
function namespace(text, prefix) {
  const list = tokens(text), edits = []
  for (let i = 0; i < list.length - 1; i++) if (['DEF', 'USE'].includes(list[i].value)) edits.push({ ...list[++i], replacement: prefix + list[i].value })
  for (const edit of edits.reverse()) text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  return text
}
function safeVrml(value, base) {
  try {
    const url = new URL(value, base)
    if (url.origin === 'https://savage.nps.edu' && url.pathname.startsWith('/Savage/') && url.pathname.endsWith('.wrl') && !url.username && !url.password) {
      url.hash = ''; return url.href
    }
  } catch { /* 略过原文件中的无效备用 URL。 */ }
}

export async function prepareVrml(model, original, workspace, { fetchImpl, signal, onProgress, models = [] }) {
  if (original.bytes > 32 * 1024 * 1024) throw new DownloadError('静态 VRML 预览文件超过 32 MB。')
  const seen = new Map([[model.modelUrl, { ...original, text: await readFile(original.path, 'utf8'), url: model.modelUrl }]])
  let serial = 0, totalBytes = original.bytes
  const dependencies = [], resources = {}
  async function acquire(url) {
    if (seen.has(url)) return seen.get(url)
    if (seen.size >= 64) throw new DownloadError('VRML 依赖超过 64 个文件，已停止准备。')
    const indexed = models.find(item => item.modelUrl?.replace(/\.x3d$/, '.wrl') === url)
    const entry = { ...model, ...indexed, modelUrl: url, format: 'VRML',
      id: decodeURIComponent(new URL(url).pathname.slice('/Savage/'.length)).replace(/\.wrl$/, ''),
      sourcePage: indexed?.sourcePage ?? url, author: indexed?.author ?? 'SAVAGE 部件原作者（见文件元信息）' }
    const value = await saveModel(entry, workspace, { fetchImpl, signal, onProgress })
    totalBytes += value.bytes
    if (totalBytes > 128 * 1024 * 1024) throw new DownloadError('VRML 预览依赖总大小超过 128 MB。')
    const document = { ...value, text: await readFile(value.path, 'utf8'), url }
    seen.set(url, document)
    dependencies.push({ url, path: value.path, format: 'VRML', author: entry.author, licenseUrl: entry.licenseUrl })
    return document
  }
  async function textures(text, base) {
    for (const block of nodeBlocks(text, 'ImageTexture').reverse()) {
      const candidates = block.urls.map(value => {
        try {
          const url = new URL(value, base)
          if (url.origin === 'https://savage.nps.edu' && url.pathname.startsWith('/Savage/') && /\.(png|jpe?g|webp|gif|bmp)$/i.test(url.pathname)) { url.hash = ''; return url.href }
        } catch { /* 只取真实列表中允许的图片来源。 */ }
      }).filter(Boolean)
      if (!candidates.length) throw new DownloadError('纹理未提供允许来源的图片文件。')
      let id, lastError
      for (const url of [...new Set(candidates)]) {
        id = createHash('sha256').update(url).digest('hex').slice(0, 32)
        if (resources[id]) break
        if (Object.keys(resources).length >= 32) throw new DownloadError('预览纹理超过 32 张，已停止。')
        const extension = new URL(url).pathname.split('.').at(-1).toLowerCase()
        const format = ['jpg', 'jpeg'].includes(extension) ? 'JPEG' : extension.toUpperCase()
        try {
          const saved = await saveModel({ ...model, modelUrl: url, format,
            id: 'preview-textures/' + decodeURIComponent(new URL(url).pathname.slice('/Savage/'.length)), sourcePage: url,
            author: '原始纹理作者（见所属场景的元信息与许可）' }, workspace, { fetchImpl, signal, onProgress, maxBytes: 16 * 1024 * 1024 })
          resources[id] = { path: saved.path, contentType: saved.mediaType }
          totalBytes += saved.bytes
          if (totalBytes > 128 * 1024 * 1024) throw new DownloadError('预览依赖总大小超过 128 MB。')
          dependencies.push({ url, path: saved.path, format, licenseUrl: model.licenseUrl }); break
        } catch (error) { signal.throwIfAborted(); lastError = error; id = undefined }
      }
      if (!id || !resources[id]) throw new DownloadError(`预览纹理读取失败：${lastError?.message ?? '图片不可用'}`)
      text = text.slice(0, block.urlStart) + `"texture/${id}"` + text.slice(block.urlEnd)
    }
    return text
  }
  async function expand(document, ancestors) {
    signal.throwIfAborted()
    if (ancestors.size > 8) throw new DownloadError('VRML 子场景嵌套超过 8 层。')
    let text = await textures(document.text, document.url)
    const blocks = nodeBlocks(text)
    for (const block of blocks.reverse()) {
      const candidates = [...new Set(block.urls.map(value => safeVrml(value, document.url)).filter(Boolean))]
      if (!candidates.length) throw new DownloadError('Inline 未提供允许来源的 VRML97 资源地址。')
      let child, lastError
      for (const url of candidates) {
        if (ancestors.has(url)) throw new DownloadError('VRML 子场景包含循环引用。')
        try { child = await acquire(url); break } catch (error) { signal.throwIfAborted(); lastError = error }
      }
      if (!child) throw lastError
      const body = await expand(child, new Set([...ancestors, child.url]))
      const replacement = `Group { children [\n${namespace(body, `DSH_INLINE_${++serial}_`)}\n] }`
      text = text.slice(0, block.start) + replacement + text.slice(block.end)
      if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new DownloadError('展开后的静态预览超过 32 MB。')
    }
    return text
  }
  const text = await expand(seen.get(model.modelUrl), new Set([model.modelUrl]))
  if (!dependencies.length) return { ...original, dependencies, resources }
  signal.throwIfAborted()
  const path = join(dirname(original.path), `${basename(original.path, '.wrl')}.preview-${randomUUID()}.wrl`)
  let file, metadata
  try {
    file = await open(path, 'wx'); await file.writeFile(text); await file.close()
    metadata = await open(path + '.source.json', 'wx')
    await metadata.writeFile(JSON.stringify({ name: model.name, modelUrl: model.modelUrl, sourcePage: model.sourcePage,
      author: model.author, licenseUrl: model.licenseUrl, attribution: model.attribution,
      modifications: 'Inline 同源子场景已展开并为 DEF/USE 增加局部命名空间；原始文件和逐项来源记录保留；查看器忽略 ROUTE。', dependencies }, null, 2) + '\n')
    await metadata.close(); signal.throwIfAborted()
    return { ...original, path, filename: basename(path), bytes: Buffer.byteLength(text), dependencies, resources }
  } catch (error) {
    if (file) { await file.close(); await rm(path, { force: true }) }
    if (metadata) { await metadata.close(); await rm(path + '.source.json', { force: true }) }
    throw error
  }
}
