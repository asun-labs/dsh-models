import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'tsdown'

export const root = resolve(import.meta.dirname, '..')

export async function buildPlugin() {
  const output = join(root, 'lib')
  if (resolve(output) !== resolve(root, 'lib')) throw new Error('构建目录无效。')
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const common = { config: false, cwd: root, outDir: output, clean: false, dts: false, sourcemap: true }
  await build({ ...common, entry: { index: 'src/index.js' }, format: 'esm', platform: 'node', target: 'node22.19.0', fixedExtension: false })
  const client = { ...common, format: 'cjs', platform: 'browser', target: 'es2022',
    deps: { neverBundle: [/^react(?:-dom)?(?:\/|$)/] }, define: { 'process.env.NODE_ENV': '"production"' } }
  await build({ ...client, entry: { 'client-api': 'src/client-api.jsx' }, outputOptions: { entryFileNames: 'client-api.cjs' } })
  await build({ ...client, entry: { client: 'src/client.jsx' }, outputOptions: {
    entryFileNames: 'client.js', banner: 'window.__ModuleLoader__.load({ id: "dsh-models", factory: (require) => {',
    footer: 'return module.exports; } });', intro: 'var module = { exports: {} }; var exports = module.exports;',
  } })
  cpSync(join(root, 'third-party'), join(output, 'third-party'), { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildPlugin()
