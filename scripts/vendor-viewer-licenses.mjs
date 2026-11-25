import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

if (process.argv.includes('--help')) {
  console.log('保存 Three.js 内嵌解析器/解码器的原始许可并核验 npm 归档摘要。\n示例：node scripts/vendor-viewer-licenses.mjs\n只提取 LICENSE/NOTICE，不安装或执行依赖脚本。')
  process.exit(0)
}
const root = resolve(import.meta.dirname, '..'), cache = join(root, '.build/viewer-license-cache')
const output = join(root, 'third-party/viewer-libs')
await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true })
const entries = [['chevrotain', '9.0.1'], ['@chevrotain/types', '9.0.1'], ['@chevrotain/utils', '9.0.0'], ['regexp-to-ast', '0.5.0'], ['meshoptimizer', '0.22.0']]
const provenance = []
for (const [name, version] of entries) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`)
  if (!response.ok) throw new Error(`${name}@${version} 元数据读取失败：${response.status}`)
  const manifest = await response.json()
  const key = name.replaceAll('/', '__'), archive = join(cache, `${key}-${version}.tgz`)
  let bytes
  try { bytes = await readFile(archive) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!bytes) { const response = await fetch(manifest.dist.tarball); if (!response.ok) throw new Error('归档下载失败'); bytes = Buffer.from(await response.arrayBuffer()); await writeFile(archive, bytes) }
  const [algorithm, hash] = manifest.dist.integrity.split('-')
  if (algorithm !== 'sha512' || createHash(algorithm).update(bytes).digest('base64') !== hash) throw new Error(`${name} 归档摘要不一致`)
  const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)
  const licenses = names.filter(path => /^package\/(?:license|licence|notice)(?:\.[^/]+)?$/i.test(path))
  if (!licenses.length) throw new Error(`${name} 未找到原始许可文件`)
  const directory = join(output, key); await mkdir(directory, { recursive: true })
  const files = {}
  for (const path of licenses) {
    const data = execFileSync('tar', ['-xOf', archive, path], { windowsHide: true })
    const filename = path.slice('package/'.length); await writeFile(join(directory, filename), data)
    files[filename] = createHash('sha256').update(data).digest('hex')
  }
  provenance.push({ name, licenseEvidenceVersion: version, license: manifest.license, archive: manifest.dist.tarball, integrity: manifest.dist.integrity, files })
}
await writeFile(join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
console.log(`已保存 ${provenance.length} 项嵌入库许可证据。`)
