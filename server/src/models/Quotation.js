import mongoose from 'mongoose'

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

QuotationSchema.methods.recalculate = function () {
  let subtotal = 0
  let vatTotal = 0
  for (const item of this.items) {
    const line = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0)
    item.total = line
    subtotal += line
    vatTotal += line * ((Number(item.vat) || 0) / 100)
  }
  this.subtotal = Math.round(subtotal * 100) / 100
  this.vatTotal = Math.round(vatTotal * 100) / 100
  this.total = Math.round((subtotal + vatTotal) * 100) / 100
}

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
