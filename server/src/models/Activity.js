import mongoose from 'mongoose'

// Feeds the "Recent Activities" panel on the dashboard (screen 2).
const ActivitySchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ['quotation', 'installation', 'ticket', 'grant', 'client', 'lead', 'compliance'], default: 'client' },
  refId: mongoose.Schema.Types.ObjectId,
  by: String,
}, { timestamps: true })

export default mongoose.model('Activity', ActivitySchema)
