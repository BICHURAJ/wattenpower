import mongoose from 'mongoose'

// Screen 5: Website Lead Capture -- the "Website (Lead Capture)" node on the workflow.
const LeadSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: String,
  postcode: String,
  leadType: {
    type: String,
    enum: ['Installation Enquiry', 'Survey Request', 'Support Request', 'General Enquiry'],
    default: 'Installation Enquiry',
  },
  preferredContactMethod: { type: String, enum: ['Email', 'Phone', 'SMS'], default: 'Email' },
  message: String,
  source: { type: String, default: 'Website' },
  status: { type: String, enum: ['New', 'Contacted', 'Survey Booked', 'Quoted', 'Closed'], default: 'New' },
  convertedClient: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
}, { timestamps: true })

export default mongoose.model('Lead', LeadSchema)
