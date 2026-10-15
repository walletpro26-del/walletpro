import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { encrypt, decrypt } from '../netlify/functions/_shared/crypto.js'

function cacheHarness() {
  const values = new Map()
  const auth = { currentUser: { uid: 'alice' } }
  const context = vm.createContext({ auth, console, localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } })
  const source = fs.readFileSync(new URL('../src/api/localCache.js', import.meta.url), 'utf8')
    .replace(/import .* from .*\r?\n/g, '').replace(/export /g, '')
  vm.runInContext(source, context)
  return { context, values, auth }
}

test('production startup does not preload PDF export libraries', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /modulepreload[^>]+(?:pdf-|html2canvas-)/)
})

test('financial snapshots never fall back to another account or a legacy cache', () => {
  const { context: c, values, auth } = cacheHarness()
  c.saveSnapshot('expenses', [{ id: 'private', amount: 5 }])
  values.set('wv_cache_expenses', '[{"id":"legacy"}]')
  auth.currentUser = { uid: 'bob' }
  assert.equal(c.loadSnapshot('expenses'), null)
  auth.currentUser = null
  assert.equal(c.loadSnapshot('expenses'), null)
  auth.currentUser = { uid: 'alice' }
  assert.equal(c.loadSnapshot('expenses')[0].id, 'private')
  c.saveSnapshot('expenses', [])
  assert.equal(c.loadSnapshot('expenses').length, 0)
})

test('offline writes and queue cleanup stay within the authenticated account', () => {
  const { context: c, auth } = cacheHarness()
  const aliceId = c.addPending({ type: 'add', collection: 'expenses', data: { amount: 5 } })
  auth.currentUser = { uid: 'bob' }
  assert.equal(c.getPendingQueue().length, 0)
  c.addPending({ type: 'add', collection: 'expenses', data: { amount: 10 } })
  c.clearAllPending()
  auth.currentUser = { uid: 'alice' }
  assert.equal(c.getPendingQueue().length, 1)
  c.clearPending([aliceId])
  assert.equal(c.getPendingQueue().length, 0)
})

test('bank encryption rejects missing keys and detects modified ciphertext', () => {
  const previous = process.env.ENCRYPTION_KEY
  try {
    delete process.env.ENCRYPTION_KEY
    assert.throws(() => encrypt('secret'), /ENCRYPTION_KEY/)
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32)
    const data = encrypt('private bank handle')
    assert.equal(decrypt(data), 'private bank handle')
    data.authTag = Buffer.alloc(16).toString('base64')
    assert.throws(() => decrypt(data))
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = previous
  }
})

test('service worker excludes authenticated endpoints and serves cached hashed assets first', async () => {
  const handlers = {}
  let networkCalls = 0
  const c = vm.createContext({ URL, Response, fetch: async () => { networkCalls++; return new Response('network') },
    caches: { open: async () => ({ match: async () => new Response('cached') }) },
    self: { location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { handlers[name] = handler } },
  })
  vm.runInContext(fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), c)
  const request = path => ({ method: 'GET', url: `https://app.test${path}`, headers: { has: () => false } })
  let response
  handlers.fetch({ request: request('/.netlify/functions/bank-sync-status'), respondWith: () => assert.fail('API request intercepted') })
  handlers.fetch({ request: request('/assets/index-abc.js'), respondWith: value => { response = value } })
  assert.equal(await (await response).text(), 'cached')
  assert.equal(networkCalls, 0)
})
