// Quotation totals, with an optional discount on the whole quote. Kept in
// step with quoteTotals() in client/src/api.js (the same test cases run on both).
//
// A quote can mix VAT rates (20% EV charger, 0% solar and batteries), so the
// discount is shared across the lines in proportion to their value, and each
// line's VAT is charged on its discounted price -- VAT is due on what the
// customer actually pays. The last line takes any rounding penny so the
// shares add up exactly to the discount.

export const DISCOUNT_TYPES = ['percent', 'amount']

const round2 = (value) => Math.round(value * 100) / 100

/** One line before any discount: net (qty x price), VAT, and total including VAT. */
export function lineAmounts(item) {
  const net = round2((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))
  const vat = round2(net * ((Number(item.vat) || 0) / 100))
  return { net, vat, total: round2(net + vat) }
}

/** The discount in pounds for a quote whose lines come to `subtotal` (ex VAT). */
export function discountAmount(subtotal, discount) {
  const value = Number(discount?.value) || 0
  if (!DISCOUNT_TYPES.includes(discount?.type) || value <= 0 || subtotal <= 0) return 0
  const raw = discount.type === 'percent' ? subtotal * (Math.min(value, 100) / 100) : Math.min(value, subtotal)
  return round2(raw)
}

/**
 * { subtotal, discount, net, vatTotal, total, lines: [{ net, share, vat }] }
 *   subtotal  the lines before discount, ex VAT
 *   discount  the discount in pounds (never more than the subtotal)
 *   net       subtotal less discount, ex VAT
 *   vatTotal  VAT on each line's discounted price
 *   total     net + VAT: what the customer pays
 */
export function quoteTotals(items = [], discount) {
  const nets = items.map((item) => lineAmounts(item).net)
  const subtotal = round2(nets.reduce((a, b) => a + b, 0))
  const off = discountAmount(subtotal, discount)
  // Share the discount by line value; the last line with value takes the rounding.
  const last = nets.reduce((at, n, i) => (n > 0 ? i : at), -1)
  let given = 0
  const lines = items.map((item, i) => {
    let share = 0
    if (off && nets[i] > 0) {
      share = i === last ? round2(off - given) : round2((off * nets[i]) / subtotal)
      given = round2(given + share)
    }
    const vat = round2((nets[i] - share) * ((Number(item.vat) || 0) / 100))
    return { net: nets[i], share, vat }
  })
  const vatTotal = round2(lines.reduce((a, l) => a + l.vat, 0))
  const net = round2(subtotal - off)
  return { subtotal, discount: off, net, vatTotal, total: round2(net + vatTotal), lines }
}
