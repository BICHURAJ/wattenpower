// Quote totals cases shared by the server (quoteMath.js) and web app (api.js)
// tests, so the two copies of the calculation can't drift apart.
export const DISCOUNT_CASES = [
  {
    name: 'no discount: unchanged from before',
    items: [{ qty: 1, unitPrice: 799, vat: 20 }, { qty: 4, unitPrice: 45, vat: 20 }],
    discount: undefined,
    expect: { subtotal: 979, discount: 0, net: 979, vatTotal: 195.8, total: 1174.8 },
  },
  {
    name: '10% off a mixed-VAT quote: VAT only on the EV line, after its share',
    items: [{ qty: 1, unitPrice: 1000, vat: 20 }, { qty: 1, unitPrice: 4000, vat: 0 }],
    discount: { type: 'percent', value: 10 },
    expect: { subtotal: 5000, discount: 500, net: 4500, vatTotal: 180, total: 4680 },
  },
  {
    name: '£250 off, split by line value',
    items: [{ qty: 1, unitPrice: 1000, vat: 20 }, { qty: 1, unitPrice: 4000, vat: 0 }],
    discount: { type: 'amount', value: 250 },
    expect: { subtotal: 5000, discount: 250, net: 4750, vatTotal: 190, total: 4940 },
  },
  {
    name: 'rounding pennies land on the last line',
    items: [{ qty: 1, unitPrice: 33.33, vat: 20 }, { qty: 1, unitPrice: 33.33, vat: 20 }, { qty: 1, unitPrice: 33.34, vat: 20 }],
    discount: { type: 'amount', value: 10 },
    expect: { subtotal: 100, discount: 10, net: 90, vatTotal: 18, total: 108 },
  },
  {
    name: '100% off: nothing to pay',
    items: [{ qty: 2, unitPrice: 50, vat: 20 }],
    discount: { type: 'percent', value: 100 },
    expect: { subtotal: 100, discount: 100, net: 0, vatTotal: 0, total: 0 },
  },
]
