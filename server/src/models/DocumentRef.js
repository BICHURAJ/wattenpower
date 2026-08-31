import mongoose from 'mongoose'

// The "Documents" panel on the Compliance Hub -- the reference rulebooks and guidance.
const DocumentRefSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'Regulation' },
  description: String,
  url: String,
  relatedModel: String,
  relatedId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true })

export default mongoose.model('DocumentRef', DocumentRefSchema)
