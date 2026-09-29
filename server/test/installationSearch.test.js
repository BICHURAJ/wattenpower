import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchWords, productFor, wordRegex } from '../src/installationSearch.js'

test('queries split into words, with quoted phrases kept together', () => {
  assert.deepEqual(searchWords('  solar   Leeds '), ['solar', 'Leeds'])
  assert.deepEqual(searchWords('"High Street" ev'), ['High Street', 'ev'])
  assert.deepEqual(searchWords('smith, leeds'), ['smith', 'leeds'])
  assert.deepEqual(searchWords(''), [])
  assert.equal(searchWords('a b c d e f g h i j').length, 8)
})

test('everyday product words map to the product', () => {
  assert.equal(productFor('EV'), 'ev')
  assert.equal(productFor('charger'), 'ev')
  assert.equal(productFor('PV'), 'solar')
  assert.equal(productFor('panels'), 'solar')
  assert.equal(productFor('storage'), 'battery')
  assert.equal(productFor('Kevin'), undefined)
})

test('postcodes and phone numbers match whatever the spacing', () => {
  assert.match('LS1 4AP', wordRegex('ls14ap', 'postcode'))
  assert.match('LS14AP', wordRegex('LS1', 'postcode'))
  assert.match('07700 900-123', wordRegex('07700900123', 'phone'))
  assert.doesNotMatch('LS1 4AP', wordRegex('ls14ap', 'address'))
})

test('user input is escaped, never run as a regex', () => {
  assert.match('a.b (c)', wordRegex('(c)', 'site'))
  assert.doesNotMatch('abc', wordRegex('a.c', 'site'))
  assert.doesNotThrow(() => wordRegex('[(*+?', 'postcode'))
})
