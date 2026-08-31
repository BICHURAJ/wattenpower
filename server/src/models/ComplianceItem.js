import mongoose from 'mongoose'

// Screen 14 -- the three "Project Compliance Hub" boxes on the workflow, in one place.
const ComplianceItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['EIC Certificate', 'Engineer Certification', 'Calibration', 'DNO Notification', 'Regulation'],
    default: 'Regulation',
  },
  reference: String,
  relatedTo: String,
  expiryDate: Date,
  status: { type: String, enum: ['Valid', 'Expiring Soon', 'Expired'], default: 'Valid' },
}, { timestamps: true })

// Derive the status from the expiry date so the Compliance Hub never shows a stale label.
ComplianceItemSchema.methods.refreshStatus = function () {
  if (!this.expiryDate) return
  const days = Math.ceil((this.expiryDate - Date.now()) / 86400000)
  this.status = days < 0 ? 'Expired' : days <= 30 ? 'Expiring Soon' : 'Valid'
}

ComplianceItemSchema.pre('save', function (next) {
  this.refreshStatus()
  next()
})

export default mongoose.model('ComplianceItem', ComplianceItemSchema)
