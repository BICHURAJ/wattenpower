import mongoose from 'mongoose'

// A point on the map, picked by staff or the customer. Optional.
export const LocationSchema = new mongoose.Schema({
  lat: { type: Number, min: -90, max: 90 },
  lng: { type: Number, min: -180, max: 180 },
}, { _id: false })

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
  location: LocationSchema,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  sites: [SiteSchema],
  contacts: [ContactSchema],
  notes: [NoteSchema],
}, { timestamps: true })

ClientSchema.index({ name: 'text', contactPerson: 'text', email: 'text' })

/**
 * Filter that leaves out records (installations etc.) belonging to Inactive
 * clients, e.g. Installation.find({ ...await Client.activeOnly() }).
 */
ClientSchema.statics.activeOnly = async function () {
  const inactive = await this.find({ status: 'Inactive' }).distinct('_id')
  return inactive.length ? { client: { $nin: inactive } } : {}
}

export default mongoose.model('Client', ClientSchema)
