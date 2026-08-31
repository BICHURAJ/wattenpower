import mongoose from 'mongoose'

// Screen 13 -- the "OZEV / OLEV Grant Submission" node in the "After Quotation" lane.
const GrantSchema = new mongoose.Schema({
  installation: { type: mongoose.Schema.Types.ObjectId, ref: 'Installation', required: true },
  grantType: {
    type: String,
    enum: ['Homecharge Scheme', 'Workplace Charging Scheme', 'EV Infrastructure Grant'],
    default: 'Homecharge Scheme',
  },
  customerConsent: { type: Boolean, default: false },
  documents: {
    invoice: { type: Boolean, default: false },
    proofOfPayment: { type: Boolean, default: false },
    eicCertificate: { type: Boolean, default: false },
    productCertificate: { type: Boolean, default: false },
    photos: { type: Boolean, default: false },
  },
  attachments: [{ name: String, uploadedAt: { type: Date, default: Date.now } }],
  comments: String,
  status: { type: String, enum: ['Draft', 'Submitted', 'Approved', 'Rejected'], default: 'Draft' },
  submittedAt: Date,
}, { timestamps: true })

export default mongoose.model('Grant', GrantSchema)
