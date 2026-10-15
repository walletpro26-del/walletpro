import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDetailPatterns, getDetailSuggestions, findReferenceRange } from '../src/utils/expenseDetailSuggestions.js'

test('recurring descriptions group changed references and reuse the latest original text', () => {
  const patterns = buildDetailPatterns([
    { category: 'Fuel', forWhom: 'Home', details: 'Petrol ref 7500 km; UPI', date: '2026-10-01' },
    { category: 'Fuel', forWhom: 'Home', details: 'Petrol ref 8017 km; UPI', date: '2026-10-15' },
    { category: 'Fuel', forWhom: 'Home', details: 'Tyre repair', date: '2026-10-16' },
  ])
  const [first] = getDetailSuggestions(patterns, ' fuel ', 'Home')
  assert.equal(first.count, 2)
  assert.equal(first.details, 'Petrol ref 8017 km; UPI')
  const range = findReferenceRange(first.details)
  assert.equal(first.details.slice(range.start, range.end), '8017')
})

test('suggestions work for arbitrary categories and prefer matching recipients', () => {
  const patterns = buildDetailPatterns([
    { category: 'Groceries', forWhom: 'Home', details: 'Weekly groceries', date: '2026-10-01' },
    { category: 'Groceries', forWhom: 'Home', details: 'Weekly groceries', date: '2026-10-08' },
    { category: 'Groceries', forWhom: 'Office', details: 'Office snacks', date: '2026-10-15' },
    { category: 'Health', details: 'Medicines', date: '2026-10-15' },
  ])
  const home = getDetailSuggestions(patterns, 'Groceries', 'Home')
  assert.equal(home[0].details, 'Weekly groceries')
  assert.equal(home[0].count, 2)
  assert.equal(getDetailSuggestions(patterns, 'Groceries', 'Office')[0].details, 'Office snacks')
  assert.equal(home.some(item => item.details === 'Medicines'), false)
  assert.deepEqual(getDetailSuggestions(patterns, ''), [])
  assert.deepEqual(getDetailSuggestions(patterns, 'Unknown'), [])
})

test('different purchase amounts and item numbers are not merged as references', () => {
  const patterns = buildDetailPatterns([
    { category: 'Groceries', details: 'Rice 5 kg' },
    { category: 'Groceries', details: 'Rice 10 kg' },
  ])
  assert.equal(patterns.length, 2)
  assert.equal(findReferenceRange('Rice 5 kg'), null)
  assert.deepEqual(findReferenceRange('Invoice reference: AB123'), null)
})
