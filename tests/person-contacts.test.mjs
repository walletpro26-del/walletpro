import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPersonContactMap, getLendingRemarkSuggestions } from '../src/utils/personContacts.js'

test('known people reuse saved phone and email without mixing people', () => {
  const map = buildPersonContactMap([
    { person: 'Alex', mobileNo: '1111111111', date: '2026-10-01' },
    { person: 'alex', email: 'alex@example.com', date: '2026-10-10' },
    { person: 'Jordan', mobileNo: '2222222222', date: '2026-10-15' },
  ])
  assert.equal(map.alex.mobileNo, '1111111111')
  assert.equal(map.alex.email, 'alex@example.com')
  assert.equal(map.jordan.mobileNo, '2222222222')
  assert.equal(map.newperson, undefined)
})

test('a contact correction on an older transaction wins over newer transaction dates', () => {
  const map = buildPersonContactMap([
    { person: 'Alex', mobileNo: 'old', email: 'old@example.com', date: '2026-10-15' },
    { person: 'Alex', mobileNo: 'corrected', email: 'corrected@example.com', date: '2026-09-01', contactEdited: true, contactUpdatedAt: '2026-10-15T12:00:00Z' },
  ])
  assert.equal(map.alex.mobileNo, 'corrected')
  assert.equal(map.alex.email, 'corrected@example.com')
})

test('explicitly cleared contacts are not restored from older records', () => {
  const map = buildPersonContactMap([
    { person: 'Alex', mobileNo: 'old', email: 'old@example.com', date: '2026-10-15' },
    { person: 'Alex', mobileNo: '', email: '', date: '2026-09-01', contactEdited: true, contactUpdatedAt: '2026-10-15T12:00:00Z' },
  ])
  assert.deepEqual(map.alex, { mobileNo: '', email: '' })
})

test('remarks prefer the selected person and type, with duplicates removed', () => {
  const suggestions = getLendingRemarkSuggestions([
    {person:'Alex',type:'They Return',remarks:'Returned by bank transfer',date:'2026-10-10'},
    {person:'Alex',type:'They Return',remarks:'Returned by bank transfer',date:'2026-10-15'},
    {person:'Alex',type:'Lend',remarks:'School fees',date:'2026-10-12'},
    {person:'Jordan',type:'They Return',remarks:'Cash repayment',date:'2026-10-15'},
  ], 'Alex', 'They Return')
  assert.deepEqual(suggestions, ['Returned by bank transfer', 'School fees', 'Cash repayment'])
})
