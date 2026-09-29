import mongoose from 'mongoose'

// The site survey for one installation (one each, created with the job). The
// checklist it follows depends on the job's products -- see surveyChecklist.js.
//
//   Not started -> Booked (a date is set) -> In progress (answers or photos
//   recorded) -> Completed (every required item and photo done; ticks the job's
//   "Site / roof survey" step, and the survey is then locked).
export const SURVEY_STATUSES = ['Not started', 'Booked', 'In progress', 'Completed']

const SiteSurveySchema = new mongoose.Schema({
  installation: { type: mongoose.Schema.Types.ObjectId, ref: 'Installation', required: true, unique: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, // copied from the job, for filtering
  status: { type: String, enum: SURVEY_STATUSES, default: 'Not started' },
  scheduledAt: Date, // booked visit
  surveyor: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  // Checklist answers: item key -> value (see surveyChecklist.js).
  answers: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => ({}) },
  notes: String,
  // Worked out on save from the answers and photos (surveyProgress), for lists and analytics.
  progress: {
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    issues: { type: Number, default: 0 }, // answers that need action
  },
  startedAt: Date,
  completedAt: Date,
  completedBy: String,
  // Completed before surveys were recorded in the CRM (no checklist on file).
  legacy: { type: Boolean, default: false },
}, { timestamps: true })

SiteSurveySchema.index({ status: 1 })

export default mongoose.model('SiteSurvey', SiteSurveySchema)
