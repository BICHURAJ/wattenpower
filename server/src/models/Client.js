import mongoose from 'mongoose'

const SiteSchema = new mongoose.Schema({
  name: String,
  address: String,
  postcode: String,
}, { _id: true })

const ContactSchema = new mongoose.Schema({
  name: String,
  role: String,
  email: String,
  phone: String,
}, { _id: true })

const NoteSchema = new mongoose.Schema({
  body: String,
  author: String,
  createdAt: { type: Date, default: Date.now },
}, { _id: true })

const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactPerson: String,
  email: String,
  phone: String,
  address: String,
  postcode: String,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  sites: [SiteSchema],
  contacts: [ContactSchema],
  notes: [NoteSchema],
}, { timestamps: true })

ClientSchema.index({ name: 'text', contactPerson: 'text', email: 'text' })

export default mongoose.model('Client', ClientSchema)
