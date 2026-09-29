import mongoose from 'mongoose'
import { PRODUCT_KEYS } from '../processes.js'

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
  subtotal: { type: Number, default: 0 },
  vatTotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'], default: 'Draft' },
  notes: String,
  // "Financials & Contracts" node -- finance options + EV grant intent captured at quote stage.
  financeOption: { type: String, enum: ['None', 'Pay in Full', 'Finance Plan', 'OLEV Grant Funded'], default: 'None' },
  history: [HistorySchema],
}, { timestamps: true })

const round2 = (value) => Math.round(value * 100) / 100

// Each line's total includes its VAT. VAT is rounded per line, so the line
// totals add up exactly to the quote total. Keep in step with quoteTotals() in client/src/api.js.
QuotationSchema.methods.recalculate = function () {
  let subtotal = 0
  let vatTotal = 0
  for (const item of this.items) {
    const net = round2((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))
    const vat = round2(net * ((Number(item.vat) || 0) / 100))
    item.total = round2(net + vat)
    subtotal += net
    vatTotal += vat
  }
  this.subtotal = round2(subtotal)
  this.vatTotal = round2(vatTotal)
  this.total = round2(this.subtotal + this.vatTotal)
}

// Installations are linked to one of their own client's quotes, so a quote
// with jobs linked to it cannot be moved to another client.
QuotationSchema.pre('validate', async function (next) {
  if (!this.isNew && this.isModified('client')) {
    const linked = await mongoose.model('Installation').exists({ quotation: this._id })
    if (linked) this.invalidate('client', 'This quotation has an installation linked to it, so its client cannot be changed.')
  }
  next()
})

QuotationSchema.pre('save', async function (next) {
  this.recalculate()
  if (!this.quoteNo) {
    const last = await this.constructor.findOne({}).sort({ quoteNo: -1 }).select('quoteNo').lean()
    const lastNum = last?.quoteNo ? parseInt(last.quoteNo.replace(/\D/g, ''), 10) : 10020
    this.quoteNo = `Q-${lastNum + 1}`
  }
  next()
})

export default mongoose.model('Quotation', QuotationSchema)
