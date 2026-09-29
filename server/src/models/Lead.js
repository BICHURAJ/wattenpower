import mongoose from 'mongoose'
import { LocationSchema } from './Client.js'
import { PRODUCT_KEYS } from '../processes.js'

// Screen 5: Website Lead Capture -- the "Website (Lead Capture)" node on the workflow.
const LeadSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: String,
  postcode: String,
  location: LocationSchema,
  leadType: {
    type: String,
    enum: ['Installation Enquiry', 'Survey Request', 'Support Request', 'General Enquiry'],
    default: 'Installation Enquiry',
  },
  preferredContactMethod: { type: String, enum: ['Email', 'Phone', 'SMS'], default: 'Email' },
  message: String,
  // What they're interested in (EV charger / solar PV / battery). Empty = not sure yet.
  products: { type: [{ type: String, enum: PRODUCT_KEYS }], default: [] },
  source: { type: String, default: 'Website' },
  status: { type: String, enum: ['New', 'Contacted', 'Survey Booked', 'Quoted', 'Closed'], default: 'New' },
  convertedClient: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
}, { timestamps: true })

export default mongoose.model('Lead', LeadSchema)
