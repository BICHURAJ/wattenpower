import mongoose from 'mongoose'

// How a job is put to the network operator, and where that has got to.
export const DNO_ROUTES = ['G98', 'G99', 'EV charge point', 'Not required']
export const DNO_STATUSES = ['Not submitted', 'Awaiting approval', 'Approved', 'Rejected', 'Notified']
import { LocationSchema } from './Client.js'
import { SystemDesignSchema } from './SystemDesign.js'
import { PRODUCT_KEYS, HAND_STEP_KEYS, stepDone, progressOrderProblem } from '../processes.js'

// A job task: something to do on this job, optionally due by a date and assigned to an engineer.
const TaskSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
  dueDate: Date,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  createdBy: String,
  doneAt: Date,
  doneBy: String,
}, { _id: true, timestamps: true })

// A note on the job's log (Notes tab). The job's single `notes` field stays as its general notes.
const NoteSchema = new mongoose.Schema({
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  author: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedAt: Date,
}, { _id: true, timestamps: true })

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
  // The engineer's name, kept when they're deleted so past jobs still show who did the work.
  engineerName: String,
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
  // The DNO application / notification and where it's got to (see DNO_STATUSES).
  // "Awaiting approval" is a G99 (or EV) application the network operator
  // hasn't decided yet -- the job can't be installed until it's approved.
  dno: {
    route: { type: String, enum: ['', ...DNO_ROUTES], default: '' },
    status: { type: String, enum: DNO_STATUSES, default: 'Not submitted' },
    reference: { type: String, trim: true, maxlength: 100 },
    submittedAt: Date,
    decisionAt: Date,
    notes: { type: String, trim: true, maxlength: 1000 },
  },
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
  noteLog: [NoteSchema],
  // Handover record: commissioning results, certificates and what the customer
  // was given (handoverChecklist.js). Completing it ticks the Handover step.
  handover: {
    answers: { type: Map, of: mongoose.Schema.Types.Mixed },
    completedAt: Date,
    completedBy: String,
  },
}, { timestamps: true })

// A completed site survey is final: once ticked it cannot be unticked by hand --
// only by reopening the survey (POST /site-surveys/:id/reopen).
InstallationSchema.pre('validate', function (next) {
  if (!this.isNew && !this.$locals.reopenSurvey && this.isModified('progress.siteSurveyCompleted') && !stepDone(this.progress, 'siteSurveyCompleted')) {
    this.invalidate('progress.siteSurveyCompleted', 'The site survey is already completed and cannot be undone.')
  }
  next()
})

// The survey step is ticked by completing the job's site survey (Operations >
// Site Survey), not by hand -- unless the job has no survey on record.
InstallationSchema.pre('validate', async function (next) {
  if (!this.isNew && !this.$locals.fromSurvey && this.isModified('progress.siteSurveyCompleted') &&
      stepDone(this.progress, 'siteSurveyCompleted') && !stepDone(this.$locals.loadedProgress, 'siteSurveyCompleted')) {
    const survey = await mongoose.model('SiteSurvey').findOne({ installation: this._id }).select('status').lean()
    if (survey && survey.status !== 'Completed') {
      this.invalidate('progress.siteSurveyCompleted', 'Complete the site survey (Operations > Site Survey) to tick this step.')
    }
  }
  next()
})

// The Handover step is ticked by completing the job's handover record (Handover tab).
InstallationSchema.pre('validate', function (next) {
  if (!this.isNew && !this.$locals.fromHandover && this.isModified('progress.handover') &&
      stepDone(this.progress, 'handover') && !stepDone(this.$locals.loadedProgress, 'handover')) {
    this.invalidate('progress.handover', 'Complete the handover (Handover tab) to tick this step.')
  }
  next()
})

// The DNO step waits for the network operator: it can't be ticked while an
// application is awaiting approval or was rejected.
InstallationSchema.pre('validate', function (next) {
  if (!this.isNew && this.isModified('progress.dnoApplication') && stepDone(this.progress, 'dnoApplication') &&
      !stepDone(this.$locals.loadedProgress, 'dnoApplication') && ['Awaiting approval', 'Rejected'].includes(this.dno?.status)) {
    this.invalidate('progress.dnoApplication', this.dno.status === 'Rejected'
      ? 'The DNO rejected the application. Update the DNO record before ticking this step.'
      : 'DNO approval is still pending. Record the approval (Compliance tab) to tick this step.')
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

// Remember the progress as loaded, so a save can tell which steps changed.
function rememberProgress() {
  this.$locals.loadedProgress = Object.fromEntries(this.progress || [])
}
InstallationSchema.post('init', rememberProgress)
InstallationSchema.post('save', rememberProgress)

// Steps are done in order, and Completed needs them all (progressOrderProblem).
InstallationSchema.pre('validate', function (next) {
  const completing = this.status === 'Completed' && (this.isNew || this.isModified('status'))
  if (this.isNew || this.isModified('progress') || completing) {
    const before = this.isNew ? {} : this.$locals.loadedProgress || {}
    const problem = progressOrderProblem(this.products, before, this.progress, { completing })
    if (problem) this.invalidate(problem.key === 'status' ? 'status' : 'progress.' + problem.key, problem.message)
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
