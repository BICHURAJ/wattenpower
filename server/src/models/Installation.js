import mongoose from 'mongoose'
import { LocationSchema } from './Client.js'
import { SystemDesignSchema } from './SystemDesign.js'
import { PRODUCT_KEYS, HAND_STEP_KEYS, stepDone } from '../processes.js'

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
  // What's being installed: any mix of EV charger, solar PV and battery (see processes.js).
  products: { type: [{ type: String, enum: PRODUCT_KEYS }], default: ['ev'] },
  // Solar / battery system, copied from the quotation and then kept as-built.
  design: SystemDesignSchema,
  // EV charger details
  chargerModel: String,
  supplyType: { type: String, enum: ['Single Phase', 'Three Phase'], default: 'Single Phase' },
  // Where the job is. Defaults to the client's address but can differ (another site, a tenant...).
  address: String,
  postcode: String,
  coordinates: LocationSchema, // map pin { lat, lng }
  // Where on the property the charger goes, e.g. "Garage - Right Wall".
  location: String,
  accessNotes: String,
  // Progress: step key -> done. Which steps a job has depends on its products
  // (stepsFor in processes.js); a missing step counts as not done.
  progress: { type: Map, of: Boolean, default: () => ({}) },
  // "Project Compliance Hub -- DNO Notification" node on the workflow.
  dnoNotified: { type: Boolean, default: false },
  dnoNotifiedAt: Date,
  // When the job was marked Completed (cleared if it is reopened).
  completedAt: Date,
  // Set while the job is On Hold, so it can be shown and resumed where it left off.
  hold: {
    reason: String,
    since: Date,
    previousStatus: String,
  },
  tasks: [TaskSchema],
  notes: String,
}, { timestamps: true })

// A completed site survey is final: once ticked it cannot be unticked.
InstallationSchema.pre('validate', function (next) {
  if (!this.isNew && this.isModified('progress.siteSurveyCompleted') && !stepDone(this.progress, 'siteSurveyCompleted')) {
    this.invalidate('progress.siteSurveyCompleted', 'The site survey is already completed and cannot be undone.')
  }
  next()
})

// Progress is frozen while a job is on hold.
InstallationSchema.pre('validate', function (next) {
  if (!this.isNew && this.status === 'On Hold' && !this.isModified('status') &&
      HAND_STEP_KEYS.some((step) => this.isModified('progress.' + step))) {
    this.invalidate('progress', 'This job is on hold. Resume it before changing its progress.')
  }
  // Moved off hold some other way (e.g. the edit form): the hold details no longer apply.
  if (this.isModified('status') && this.status !== 'On Hold' && this.hold?.since) this.hold = undefined
  next()
})

// Record when a job is completed; reopening it clears the date.
InstallationSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('status')) {
    if (this.status === 'Completed' && !this.completedAt) this.completedAt = new Date()
    if (this.status !== 'Completed' && this.completedAt) this.completedAt = undefined
  }
  next()
})

// A job can only be linked to one of its own client's quotations.
InstallationSchema.pre('validate', async function (next) {
  if (this.quotation && this.client && (this.isModified('quotation') || this.isModified('client'))) {
    const quote = await mongoose.model('Quotation').findById(this.quotation).select('client quoteNo').lean()
    if (!quote) this.invalidate('quotation', 'That quotation no longer exists.')
    else if (String(quote.client) !== String(this.client)) {
      this.invalidate('quotation', 'Quotation ' + quote.quoteNo + ' belongs to a different client.')
    }
  }
  next()
})

InstallationSchema.pre('save', async function (next) {
  if (!this.installNo) {
    const last = await this.constructor.findOne({}).sort({ installNo: -1 }).select('installNo').lean()
    const lastNum = last?.installNo ? parseInt(last.installNo.replace(/\D/g, ''), 10) : 20020
    this.installNo = `INS-${lastNum + 1}`
  }
  next()
})

InstallationSchema.index({ products: 1 })

export default mongoose.model('Installation', InstallationSchema)
