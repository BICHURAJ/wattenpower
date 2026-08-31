import mongoose from 'mongoose'

const TaskSchema = new mongoose.Schema({
  title: String,
  done: { type: Boolean, default: false },
}, { _id: true })

// Screens 9/10 -- covers "Technical Team / Lead Engineer" through "Installation Completed".
const InstallationSchema = new mongoose.Schema({
  installNo: { type: String, unique: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  site: String,
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  installDate: Date,
  status: {
    type: String,
    enum: ['Scheduled', 'In Progress', 'Completed', 'On Hold', 'Cancelled'],
    default: 'Scheduled',
  },
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  chargerModel: String,
  supplyType: { type: String, enum: ['Single Phase', 'Three Phase'], default: 'Single Phase' },
  location: String,
  accessNotes: String,
  // The five stages shown on the Installation Details progress panel.
  progress: {
    siteSurveyCompleted: { type: Boolean, default: false },
    quotationAccepted: { type: Boolean, default: false },
    installationInProgress: { type: Boolean, default: false },
    testingCertification: { type: Boolean, default: false },
    handover: { type: Boolean, default: false },
  },
  // "Project Compliance Hub -- DNO Notification" node on the workflow.
  dnoNotified: { type: Boolean, default: false },
  dnoNotifiedAt: Date,
  tasks: [TaskSchema],
  notes: String,
}, { timestamps: true })

InstallationSchema.pre('save', async function (next) {
  if (!this.installNo) {
    const last = await this.constructor.findOne({}).sort({ installNo: -1 }).select('installNo').lean()
    const lastNum = last?.installNo ? parseInt(last.installNo.replace(/\D/g, ''), 10) : 20020
    this.installNo = `INS-${lastNum + 1}`
  }
  next()
})

export default mongoose.model('Installation', InstallationSchema)
