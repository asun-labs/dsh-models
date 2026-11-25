import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const desktopRequire = createRequire(import.meta.url)

if (process.argv.includes('--help')) {
  console.log('无头 Chromium 验证模型库明暗主题、窄屏、分类与截图失败。\n示例：npm run verify:browser\n截图位于 .build/browser；需已安装 Playwright Chromium。')
  process.exit(0)
}
const output = resolve(import.meta.dirname, '../.build/browser')
const source = resolve(import.meta.dirname, '../src')
mkdirSync(output, { recursive: true })
const entry = join(output, 'entry.jsx')
const importPath = path => JSON.stringify(path.replaceAll('\\', '/'))
writeFileSync(entry, `
import React from ${importPath(desktopRequire.resolve('react'))};
import { createRoot } from ${importPath(desktopRequire.resolve('react-dom/client'))};
import { ModelsPanel } from ${importPath(join(source, 'client-api.jsx'))};
import { styles } from ${importPath(join(source, 'styles.js'))};
const style=document.createElement('style'); style.textContent=styles; document.head.append(style);
createRoot(document.getElementById('root')).render(<ModelsPanel />);
`)
const { build } = await import(pathToFileURL(desktopRequire.resolve('tsdown')).href)
await build({ config: false, entry: { preview: entry }, outDir: output, clean: false, dts: false,
  format: 'iife', platform: 'browser', target: 'es2022',
  plugins: [{ name: 'preview-react-runtime', resolveId(id) {
    if (/^react(?:-dom)?(?:\/|$)/.test(id)) return desktopRequire.resolve(id)
  } }],
  deps: { alwaysBundle: [/^react(?:-dom)?(?:\/|$)/] }, define: { 'process.env.NODE_ENV': '"production"' } })
const { chromium } = desktopRequire('playwright')
const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<html><head><style>html,body,#root{height:100%;margin:0}body{background:var(--dsw-alias-bg-layer-1)}</style></head><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: readFileSync(join(output, 'preview.iife.js'), 'utf8') })
  await page.getByRole('heading', { name: '资产库', exact: true }).waitFor()
  await page.waitForFunction(() => [...document.images].some(image => image.complete && image.naturalWidth > 0), null, { timeout: 20000 })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(dark => {
      const palette = dark ? ['#1c1d20', '#24262b', '#f1f2f3', '#a6a8ad', '#34363b'] : ['#ffffff', '#f5f6f8', '#202124', '#666b73', '#e3e5e8']
      for (const [index, key] of ['bg-layer-1', 'bg-layer-2', 'label-primary', 'label-secondary', 'border-l1'].entries())
        document.documentElement.style.setProperty('--dsw-alias-' + key, palette[index])
      document.documentElement.style.setProperty('--dsw-alias-border-l2', palette[4])
    }, theme === 'dark')
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      assert.equal(await page.locator('article').count(), 24)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      await page.screenshot({ path: join(output, `${theme}-${viewport.width}.png`), fullPage: true })
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('tab', { name: /设备/ }).click()
  await page.getByLabel('资源来源').selectOption('kenney')
  await page.getByLabel('子类分类').selectOption('electronics')
  await page.getByRole('searchbox').fill('laptop')
  assert.equal(await page.locator('article').count(), 1)
  await page.screenshot({ path: join(output, 'devices.png'), fullPage: true })
  await page.getByRole('tab', { name: /装备/ }).click()
  await page.getByLabel('资源来源').selectOption('nasa')
  assert.match(await page.getByRole('status').innerText(), /256 条资源/)
  await page.screenshot({ path: join(output, 'nasa.png'), fullPage: true })
  await page.getByLabel('资源来源').selectOption('savage')
  await page.getByLabel('子类分类').selectOption('GroundVehicles')
  assert.equal(await page.locator('article').count(), 24)
  assert.equal(await page.getByRole('button', { name: /^下载 .* X3D$/ }).count(), 24)
  await page.getByRole('button', { name: '清除筛选' }).click()
  await page.getByRole('searchbox').fill('not-a-model')
  await page.getByRole('heading', { name: '没有找到匹配的模型' }).waitFor()
  assert.deepEqual(errors, [])
  console.log(`模型库无头 Chromium 验证通过，截图：${output}`)
} finally {
  await browser.close()
}
