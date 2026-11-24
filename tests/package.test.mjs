import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { packRelease, npmCli } from '../scripts/pack.mjs'

test('完整包携带预编译 API、原生 bundle 与许可，不携带 src 或开发脚本', async t => {
  const destination = mkdtempSync(join(tmpdir(), 'dsh-models-package-test-'))
  t.after(() => rmSync(destination, { recursive: true, force: true }))
  const info = await packRelease(destination)
  const files = execFileSync('tar', ['-tzf', info.archive], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)
  for (const file of ['package/lib/index.js', 'package/lib/client.js', 'package/lib/client-api.cjs', 'package/cordis.patch.yml', 'package/npm-shrinkwrap.json', 'package/third-party/savage/LICENSE.html']) assert.ok(files.includes(file), file)
  assert.equal(files.some(file => file.startsWith('package/src/') || file.startsWith('package/scripts/')), false)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', info.archive, 'package/package.json'], { encoding: 'utf8', windowsHide: true }))
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.devDependencies, undefined)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(JSON.parse(readFileSync(info.archive + '.json', 'utf8')).sha256, info.sha256)
})
