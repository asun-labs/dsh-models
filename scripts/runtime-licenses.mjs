import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function runtimeLicenses(root) {
  const packages = new Map()
  const output = join(root, 'third-party/runtime')
  return { name: 'dsh-models-runtime-licenses', generateBundle(_options, bundle) {
    for (const entry of Object.values(bundle)) {
      if (entry.type !== 'chunk') continue
      for (const id of Object.keys(entry.modules)) {
        const normalized = id.replaceAll('\\', '/').replace(/^\0/, '')
        const matches = [...normalized.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/g)]
        const match = matches.at(-1)
        if (!match) continue
        const directory = normalized.slice(0, match.index) + '/node_modules/' + match[1]
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
        if (packages.has(manifest.name)) continue
        const destination = join(output, manifest.name.replaceAll('/', '__'))
        mkdirSync(destination, { recursive: true })
        const files = readdirSync(directory).filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file))
        if (!files.length) throw new Error(`缺少运行依赖许可文件：${manifest.name}`)
        const hashes = {}
        for (const file of files) { copyFileSync(join(directory, file), join(destination, file)); hashes[file] = createHash('sha256').update(readFileSync(join(directory, file))).digest('hex') }
        packages.set(manifest.name, { name: manifest.name, version: manifest.version, license: manifest.license, files: hashes })
      }
    }
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'provenance.json'), JSON.stringify([...packages.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n')
  } }
}
