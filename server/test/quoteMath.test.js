import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteTotals, discountAmount } from '../src/quoteMath.js'
import { DISCOUNT_CASES } from './discountCases.js'

// The same cases run against the web app's copy (client/test/quoteTotals.test.mjs).
for (const c of DISCOUNT_CASES) {
  test('quote totals: ' + c.name, () => {
    const t = quoteTotals(c.items, c.discount)
    assert.deepEqual({ subtotal: t.subtotal, discount: t.discount, net: t.net, vatTotal: t.vatTotal, total: t.total }, c.expect)
    // The shares always add up exactly to the discount.
    assert.equal(Math.round(t.lines.reduce((a, l) => a + l.share, 0) * 100) / 100, t.discount)
  })
}

test('discount amount: percent capped at 100, pounds capped at the subtotal, junk ignored', () => {
  assert.equal(discountAmount(1000, { type: 'percent', value: 150 }), 1000)
  assert.equal(discountAmount(1000, { type: 'amount', value: 5000 }), 1000)
  assert.equal(discountAmount(1000, { type: 'amount', value: -50 }), 0)
  assert.equal(discountAmount(1000, { type: 'bogus', value: 50 }), 0)
  assert.equal(discountAmount(0, { type: 'percent', value: 10 }), 0)
})
