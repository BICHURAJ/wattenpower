import mongoose from 'mongoose'

// Screen 12 -- the "Post Install Support" section of the workflow.
const TicketSchema = new mongoose.Schema({
  ticketNo: { type: String, unique: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  installation: { type: mongoose.Schema.Types.ObjectId, ref: 'Installation' },
  issue: { type: String, required: true },
  description: String,
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  status: { type: String, enum: ['Open', 'In Progress', 'Closed'], default: 'Open' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  // "Workmanship Warranties" node -- is this covered by our own guarantee?
  underWarranty: { type: Boolean, default: true },
  resolution: String,
}, { timestamps: true })

TicketSchema.pre('save', async function (next) {
  if (!this.ticketNo) {
    const last = await this.constructor.findOne({}).sort({ ticketNo: -1 }).select('ticketNo').lean()
    const lastNum = last?.ticketNo ? parseInt(last.ticketNo.replace(/\D/g, ''), 10) : 30000
    this.ticketNo = `W-${String(lastNum + 1).padStart(5, '0')}`
  }
  next()
})

export default mongoose.model('Ticket', TicketSchema)
