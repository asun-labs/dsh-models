import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, delimiter } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { buildPlugin, root } from './build.mjs'

const payload = ['lib', 'cordis.patch.yml', 'README.md', 'third-party']

export function releaseManifest(manifest) {
  const { scripts, devDependencies, ...runtime } = manifest
  return { ...runtime, files: [...payload, 'npm-shrinkwrap.json'] }
}

export function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ...(process.env.PATH ?? '').split(delimiter).map(path => join(path, 'node_modules/npm/bin/npm-cli.js'))]
  const cli = candidates.find(path => path?.endsWith('npm-cli.js') && existsSync(path))
  if (!cli) throw new Error('找不到 npm CLI，请通过 npm run pack:release 执行。')
  return cli
}

export async function packRelease(destination = join(root, 'dist')) {
  await buildPlugin()
  const stage = mkdtempSync(join(tmpdir(), 'dsh-models-release-'))
  try {
    const manifest = releaseManifest(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))
    for (const file of payload) cpSync(join(root, file), join(stage, file), { recursive: true })
    writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    // 运行包无实际 dependencies；开发依赖不进入安装锁与运行载荷。
    writeFileSync(join(stage, 'npm-shrinkwrap.json'), JSON.stringify({ name: manifest.name, version: manifest.version,
      lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: manifest.version, peerDependencies: manifest.peerDependencies } } }, null, 2) + '\n')
    mkdirSync(destination, { recursive: true })
    const output = execFileSync(process.execPath, [npmCli(), 'pack', '--ignore-scripts', '--json', '--pack-destination', resolve(destination)],
      { cwd: stage, encoding: 'utf8', windowsHide: true, env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false' } })
    const [{ filename, files }] = JSON.parse(output)
    const archive = resolve(destination, filename)
    const bytes = readFileSync(archive)
    const info = { name: manifest.name, version: manifest.version, filename,
      sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, files: files.length }
    writeFileSync(archive + '.json', JSON.stringify(info, null, 2) + '\n')
    writeFileSync(archive + '.sha256', `${info.sha256}  ${filename}\n`)
    return { ...info, archive }
  } finally {
    if (dirname(stage) !== resolve(tmpdir()) || !stage.startsWith(join(tmpdir(), 'dsh-models-release-'))) throw new Error('临时目录边界无效。')
    rmSync(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log('生成无开发脚本的完整预编译插件包。\n用法：npm run pack:release -- [输出目录]\n示例：npm run pack:release -- ./dist')
  else console.log(JSON.stringify(await packRelease(process.argv[2]), null, 2))
}
