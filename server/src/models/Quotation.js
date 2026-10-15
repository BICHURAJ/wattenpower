import mongoose from 'mongoose'
import { PRODUCT_KEYS } from '../processes.js'
import { DISCOUNT_TYPES, lineAmounts, quoteTotals } from '../quoteMath.js'

const ItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  qty: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  vat: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
}, { _id: true })

const HistorySchema = new mongoose.Schema({
  action: String,
  by: String,
  at: { type: Date, default: Date.now },
}, { _id: true })

// Screens 6/7/8 -- the "Quotations" document on the workflow.
const QuotationSchema = new mongoose.Schema({
  quoteNo: { type: String, unique: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  site: String,
  quoteDate: { type: Date, default: Date.now },
  validUntil: Date,
  reference: String,
  // What's being quoted: any mix of EV charger, solar PV and battery (see processes.js).
  products: { type: [{ type: String, enum: PRODUCT_KEYS }], default: ['ev'] },
  items: [ItemSchema],
  // Optional discount on the whole quote: a percentage or a fixed amount (ex VAT),
  // shared across the lines before VAT is worked out (see quoteMath.js).
  discount: {
    type: { type: String, enum: ['', ...DISCOUNT_TYPES], default: '' },
    value: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  subtotal: { type: Number, default: 0 }, // lines before discount, ex VAT
  discountTotal: { type: Number, default: 0 }, // the discount in pounds
  vatTotal: { type: Number, default: 0 }, // on the discounted prices
  total: { type: Number, default: 0 }, // what the customer pays
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'], default: 'Draft' },
  notes: String,
  // Wording on the PDF, filled in from the product template (client/src/quoteTemplates.js)
  // when the quote is created and editable per quote.
  title: { type: String, trim: true, maxlength: 120 }, // headline, e.g. "Ohme EV Charger Installation"
  worksDescription: { type: String, trim: true, maxlength: 4000 },
  paymentTerms: { type: String, trim: true, maxlength: 300 },
  showLinePrices: { type: Boolean, default: false }, // line prices on the PDF, or description and quantity only
  // "Financials & Contracts" node -- finance options + EV grant intent captured at quote stage.
  financeOption: { type: String, enum: ['None', 'Pay in Full', 'Finance Plan', 'OLEV Grant Funded'], default: 'None' },
  history: [HistorySchema],
}, { timestamps: true })

// Line totals (each including VAT, before any discount), then the quote's
// subtotal, discount, VAT and total (quoteMath.js, mirrored in client/src/api.js).
QuotationSchema.methods.recalculate = function () {
  for (const item of this.items) item.total = lineAmounts(item).total
  const t = quoteTotals(this.items, this.discount)
  this.subtotal = t.subtotal
  this.discountTotal = t.discount
  this.vatTotal = t.vatTotal
  this.total = t.total
}

// A percentage discount can't go over 100%.
QuotationSchema.pre('validate', function (next) {
  if (this.discount?.type === 'percent' && Number(this.discount.value) > 100) {
    this.invalidate('discount.value', 'A percentage discount cannot be more than 100%.')
  }
  if (!this.discount?.type) this.discount = { type: '', value: 0, reason: this.discount?.reason }
  next()
})

// Installations are linked to one of their own client's quotes, so a quote
// with jobs linked to it cannot be moved to another client.
QuotationSchema.pre('validate', async function (next) {
  if (!this.isNew && this.isModified('client')) {
    const linked = await mongoose.model('Installation').exists({ quotation: this._id })
    if (linked) this.invalidate('client', 'This quotation has an installation linked to it, so its client cannot be changed.')
  }
  next()
})

// Quote numbers: WP-<year>-<number>, e.g. WP-2026-01, starting again at 01 each
// year (WP-2026-100 after WP-2026-99). A counter hands them out one at a time, so
// two quotes saved together never get the same number. Older quotes keep theirs (Q-10021...).
const Counter = mongoose.models.Counter || mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: Number }, { versionKey: false }))

async function nextQuoteNo(Quotation) {
  const year = new Date().getFullYear()
  const prefix = 'WP-' + year + '-'
  // Never hand out a number already used this year (e.g. on the counter's first use).
  const used = await Quotation.find({ quoteNo: new RegExp('^' + prefix + '\\d+$') }).select('quoteNo').lean()
  const highest = Math.max(0, ...used.map((q) => parseInt(q.quoteNo.slice(prefix.length), 10)))
  await Counter.updateOne({ _id: 'quote-' + year }, { $max: { seq: highest } }, { upsert: true })
  const { seq } = await Counter.findOneAndUpdate({ _id: 'quote-' + year }, { $inc: { seq: 1 } }, { new: true }).lean()
  return prefix + String(seq).padStart(2, '0')
}

QuotationSchema.pre('save', async function (next) {
  this.recalculate()
  if (!this.quoteNo) this.quoteNo = await nextQuoteNo(this.constructor)
  next()
})

export default mongoose.model('Quotation', QuotationSchema)
