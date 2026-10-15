import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('web and Android launch surfaces use matching charcoal colors', () => {
  const web = JSON.parse(read('public/manifest.json'))
  const bundled = JSON.parse(read('app/src/main/res/raw/web_app_manifest.json'))
  const android = JSON.parse(read('twa-manifest.json'))
  assert.equal(web.background_color, '#202b27')
  assert.equal(web.theme_color, '#202b27')
  assert.equal(bundled.background_color, web.background_color)
  assert.equal(bundled.theme_color, web.theme_color)
  for (const key of ['backgroundColor', 'themeColor', 'themeColorDark', 'navigationColor', 'navigationColorDark']) assert.equal(android[key].toLowerCase(), web.theme_color)
  assert.match(read('index.html'), /name="theme-color" content="#202b27"/)
  assert.doesNotMatch(read('app/build.gradle'), /#0F172A/i)
})

test('one plain startup spinner replaces the second branded splash', () => {
  const html = read('index.html')
  const startup = html.slice(html.indexOf('<div id="startup-loader"'), html.indexOf('<script type="module"'))
  assert.equal((startup.match(/animation:wv-spin/g) || []).length, 1)
  assert.doesNotMatch(startup, /<svg|<img|#6366f1|#818cf8|#a855f7|#0f172a/i)
  assert.match(read('src/App.jsx'), /if \(!authReady\)\s*{\s*return null/)
  assert.match(read('src/App.jsx'), /getElementById\('startup-loader'\)\?\.remove\(\)/)
})

test('installed clients can revalidate the startup shell after deployment', () => {
  assert.match(read('src/main.jsx'), /updateViaCache: 'none'/)
  assert.match(read('public/service-worker.js'), /walletvibe-cache-v11/)
  assert.match(read('netlify.toml'), /for = "\/manifest.json"[\s\S]*?Cache-Control = "no-cache"/)
})
