import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteTotals } from '../src/api.js'
// The server's cases, so the web app and server always agree on quote totals.
import { DISCOUNT_CASES } from '../../server/test/discountCases.js'

for (const c of DISCOUNT_CASES) {
  test('quote totals (web app): ' + c.name, () => {
    assert.deepEqual(quoteTotals(c.items, c.discount), c.expect)
  })
}
