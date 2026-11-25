import { parse } from 'parse5'
import { DownloadError } from './download.js'

export function findVrmlUrl(html, model) {
  const page = new URL(model.sourcePage)
  if (page.origin !== 'https://savage.nps.edu' || !page.pathname.startsWith('/Savage/')) throw new DownloadError('预览来源不在 SAVAGE 目录。')
  const links = []
  function visit(node) {
    if (node.tagName === 'a') {
      const href = node.attrs?.find(attr => attr.name === 'href')?.value
      if (href) {
        const url = new URL(href, page)
        if (url.origin === page.origin && url.pathname.startsWith('/Savage/') && url.pathname.endsWith('.wrl') && !url.username && !url.password) links.push(url.href)
      }
    }
    for (const child of node.childNodes ?? []) visit(child)
  }
  visit(parse(html))
  const basename = new URL(model.modelUrl).pathname.split('/').at(-1).replace(/\.x3d$/, '.wrl')
  const result = links.find(link => new URL(link).pathname.split('/').at(-1) === basename)
  if (!result) throw new DownloadError('来源页未提供对应 VRML97 预览。原始 X3D 已保存，可从来源页查看。', 'previewUnavailable')
  return result
}

export async function resolveVrml(model, fetchImpl, signal) {
  const response = await fetchImpl(model.sourcePage, { signal, redirect: 'error' })
  if (!response.ok) throw new DownloadError(`预览来源页读取失败（HTTP ${response.status}）。`)
  const reader = response.body.getReader()
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2 * 1024 * 1024) throw new DownloadError('预览来源页超过大小上限。')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  return findVrmlUrl(Buffer.concat(chunks).toString('utf8'), model)
}
