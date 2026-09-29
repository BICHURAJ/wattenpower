import SiteSurvey from './models/SiteSurvey.js'
import SitePhoto from './models/SitePhoto.js'
import Installation from './models/Installation.js'
import { surveyProgress } from './surveyChecklist.js'
import { stepDone } from './processes.js'

// Keeps each installation's site survey in step with the job: one survey per
// job, its completeness worked out from answers + photos, and its status.

/** Checklist photo slots that have at least one photo. */
export async function filledPhotoSlots(installationId) {
  const slots = await SitePhoto.distinct('slot', { installation: installationId, stage: 'survey', slot: { $nin: [null, ''] } })
  return new Set(slots)
}

/** Full progress detail (missing items, issues) for a survey. */
export async function progressFor(survey, installation) {
  return surveyProgress(installation?.products, survey.answers, await filledPhotoSlots(survey.installation))
}

/**
 * Recalculates a survey's stored progress and status (unless it's completed,
 * which is final). `installation` may be passed to save a lookup. Saves it.
 */
export async function refreshSurvey(survey, installation) {
  const job = installation || await Installation.findById(survey.installation).select('products').lean()
  const p = await progressFor(survey, job)
  survey.progress = { done: p.done, total: p.total, percent: p.percent, issues: p.issues.length }
  if (survey.status !== 'Completed') {
    const started = p.done > 0 || Boolean(survey.notes)
    if (started) {
      survey.status = 'In progress'
      if (!survey.startedAt) survey.startedAt = new Date()
    } else {
      survey.status = survey.scheduledAt ? 'Booked' : 'Not started'
    }
  }
  await survey.save()
  return p
}

/** The job's survey, created if it doesn't have one yet. */
export async function ensureSurvey(installation) {
  const existing = await SiteSurvey.findOne({ installation: installation._id })
  if (existing) return existing
  const survey = new SiteSurvey({ installation: installation._id, client: installation.client })
  // A job whose survey step is already ticked (from before surveys were
  // recorded here) gets a completed survey with no checklist on file.
  if (stepDone(installation.progress, 'siteSurveyCompleted')) {
    survey.status = 'Completed'
    survey.legacy = true
    survey.completedAt = installation.updatedAt || new Date()
  }
  try {
    await refreshSurvey(survey, installation)
  } catch (err) {
    if (err.code === 11000) return SiteSurvey.findOne({ installation: installation._id }) // created meanwhile
    throw err
  }
  return survey
}

/** On startup: every installation gets a survey. Returns how many were created. */
export async function backfillSurveys() {
  const have = await SiteSurvey.distinct('installation')
  const missing = await Installation.find({ _id: { $nin: have } }).select('client products progress updatedAt').lean()
  for (const job of missing) await ensureSurvey(job)
  return missing.length
}
