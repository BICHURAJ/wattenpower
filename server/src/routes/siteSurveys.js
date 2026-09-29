import express from 'express'
import mongoose from 'mongoose'
import SiteSurvey, { SURVEY_STATUSES } from '../models/SiteSurvey.js'
import SitePhoto from '../models/SitePhoto.js'
import Installation from '../models/Installation.js'
import Client from '../models/Client.js'
import Activity from '../models/Activity.js'
import { userCan } from '../permissions.js'
import { installationSearch } from '../installationSearch.js'
import { surveySectionsFor, surveyProgress } from '../surveyChecklist.js'
import { ensureSurvey, progressFor, refreshSurvey } from '../surveyService.js'

// Site surveys (Operations > Site Survey). One per installation; the checklist
// follows the job's products (surveyChecklist.js). Completing a survey ticks
// the job's "Site / roof survey" step.
const router = express.Router()

const JOB_FIELDS = 'installNo products status installDate address postcode client engineer progress'
const isId = (id) => mongoose.isValidObjectId(id)
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Jobs that count: not cancelled, client not inactive, plus any list filters. */
async function jobFilter({ q, products } = {}) {
  const filter = { ...(await Client.activeOnly()), status: { $ne: 'Cancelled' } }
  if (products && products !== 'All') filter.products = products
  if (q) Object.assign(filter, await installationSearch(q))
  return filter
}

/** The jobs that count and their surveys (with job, client and surveyor for reports). */
async function surveysForAnalytics({ detail = false } = {}) {
  const jobs = await Installation.find(await jobFilter())
    .select(detail ? JOB_FIELDS : '_id products')
    .populate(detail ? [{ path: 'client', select: 'name postcode' }, { path: 'engineer', select: 'name' }] : [])
    .lean()
  const surveys = await SiteSurvey.find({ installation: { $in: jobs.map((j) => j._id) } })
    .select('installation status scheduledAt progress startedAt completedAt completedBy legacy surveyor answers')
    .populate(detail ? { path: 'surveyor', select: 'name' } : [])
    .lean()
  const jobById = new Map(jobs.map((j) => [String(j._id), j]))
  return { jobs, surveys: surveys.map((s) => ({ ...s, job: jobById.get(String(s.installation)) })) }
}

/** Headline figures: how much is covered and what's pending. */
async function surveyStats({ jobs, surveys }) {
  const today = startOfToday()
  const week = new Date(today.getTime() + 7 * 864e5)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const counts = Object.fromEntries(SURVEY_STATUSES.map((st) => [st, 0]))
  const byProduct = { ev: { total: 0, completed: 0 }, solar: { total: 0, completed: 0 }, battery: { total: 0, completed: 0 } }
  let overdue = 0
  let upcoming = 0
  let withIssues = 0
  let completedThisMonth = 0
  let inProgressPercent = 0
  for (const s of surveys) {
    counts[s.status]++
    const done = s.status === 'Completed'
    for (const p of s.job?.products || ['ev']) {
      if (!byProduct[p]) continue
      byProduct[p].total++
      if (done) byProduct[p].completed++
    }
    if (s.status === 'Booked' && s.scheduledAt && s.scheduledAt < today) overdue++
    if (!done && s.scheduledAt && s.scheduledAt >= today && s.scheduledAt < week) upcoming++
    if (!done && s.progress?.issues) withIssues++
    // Surveys from before the CRM have no real completion date.
    if (done && !s.legacy && s.completedAt && s.completedAt >= monthStart) completedThisMonth++
    if (s.status === 'In progress') inProgressPercent += s.progress?.percent || 0
  }
  const total = surveys.length
  const photos = await SitePhoto.countDocuments({ installation: { $in: jobs.map((j) => j._id) }, stage: 'survey' })
  return {
    total,
    counts,
    pending: total - counts.Completed,
    coverage: total ? Math.round((counts.Completed / total) * 100) : 0,
    averageInProgress: counts['In progress'] ? Math.round(inProgressPercent / counts['In progress']) : 0,
    overdue,
    upcoming,
    withIssues,
    completedThisMonth,
    photos,
    byProduct,
  }
}

// Analytics for the Site Survey page.
router.get('/stats', async (req, res, next) => {
  try {
    res.json(await surveyStats(await surveysForAnalytics()))
  } catch (err) { next(err) }
})

// The analytics report (PDF on the Site Survey page): the headline figures plus
// what needs chasing, each surveyor's workload and a six-month trend.
router.get('/report', async (req, res, next) => {
  try {
    const data = await surveysForAnalytics({ detail: true })
    const stats = await surveyStats(data)
    const today = startOfToday()
    const fortnight = new Date(today.getTime() + 14 * 864e5)
    const row = (s) => ({
      id: s._id,
      installNo: s.job?.installNo,
      client: s.job?.client?.name,
      postcode: s.job?.postcode || s.job?.client?.postcode,
      products: s.job?.products || ['ev'],
      status: s.status,
      scheduledAt: s.scheduledAt || null,
      installDate: s.job?.installDate || null,
      surveyor: s.surveyor?.name || s.job?.engineer?.name || null,
      percent: s.legacy ? 100 : s.progress?.percent || 0,
      issues: s.progress?.issues || 0,
    })
    const open = data.surveys.filter((s) => s.status !== 'Completed')
    const byDate = (key) => (a, b) => new Date(a[key] || 0) - new Date(b[key] || 0)

    // What each open survey with issues needs doing.
    const needsAction = []
    for (const s of open.filter((x) => x.progress?.issues)) {
      const p = surveyProgress(s.job?.products, s.answers || {})
      needsAction.push({ ...row(s), issueLabels: p.issues.map((i) => i.label) })
    }

    // Per surveyor: the survey's surveyor, else the job's engineer.
    const people = new Map()
    for (const s of data.surveys) {
      const name = s.surveyor?.name || s.job?.engineer?.name || 'Unassigned'
      if (!people.has(name)) people.set(name, { name, completed: 0, inProgress: 0, booked: 0, notStarted: 0, overdue: 0, days: [] })
      const p = people.get(name)
      if (s.status === 'Completed') {
        p.completed++
        if (!s.legacy && s.startedAt && s.completedAt) p.days.push((new Date(s.completedAt) - new Date(s.startedAt)) / 864e5)
      } else if (s.status === 'In progress') p.inProgress++
      else if (s.status === 'Booked') p.booked++
      else p.notStarted++
      if (s.status === 'Booked' && s.scheduledAt && s.scheduledAt < today) p.overdue++
    }
    const bySurveyor = [...people.values()]
      .map(({ days, ...p }) => ({ ...p, averageDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null }))
      .sort((a, b) => (a.name === 'Unassigned') - (b.name === 'Unassigned') || b.completed - a.completed)

    // Surveys completed in each of the last six months (legacy ones have no real date).
    const months = []
    for (let i = 5; i >= 0; i--) {
      const from = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1)
      months.push({
        month: from.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        completed: data.surveys.filter((s) => !s.legacy && s.completedAt && s.completedAt >= from && s.completedAt < to).length,
      })
    }

    res.json({
      generatedAt: new Date(),
      stats,
      overdue: open.filter((s) => s.status === 'Booked' && s.scheduledAt && s.scheduledAt < today).sort(byDate('scheduledAt')).map(row),
      upcoming: open.filter((s) => s.scheduledAt && s.scheduledAt >= today && s.scheduledAt < fortnight).sort(byDate('scheduledAt')).map(row),
      inProgress: open.filter((s) => s.status === 'In progress').sort((a, b) => (b.progress?.percent || 0) - (a.progress?.percent || 0)).map(row),
      // Installation booked in the next two weeks but the survey isn't done: a risk to the date.
      atRisk: open.filter((s) => s.job?.installDate && new Date(s.job.installDate) < fortnight).sort((a, b) => new Date(a.job.installDate) - new Date(b.job.installDate)).map(row),
      notStarted: open.filter((s) => s.status === 'Not started').sort((a, b) => new Date(a.job?.installDate || 8.64e15) - new Date(b.job?.installDate || 8.64e15)).map(row),
      needsAction,
      bySurveyor,
      months,
    })
  } catch (err) { next(err) }
})

// The survey list, with the job, surveyor and photo count.
// ?status=Booked|...|overdue  ?q=search  ?products=solar  ?page=
router.get('/', async (req, res, next) => {
  try {
    const { status, q, products, page = 1 } = req.query
    const jobs = await Installation.find(await jobFilter({ q, products })).distinct('_id')
    const filter = { installation: { $in: jobs } }
    if (status === 'overdue') Object.assign(filter, { status: 'Booked', scheduledAt: { $lt: startOfToday() } })
    else if (status === 'pending') filter.status = { $ne: 'Completed' }
    else if (SURVEY_STATUSES.includes(status)) filter.status = status
    const perPage = 25
    const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage
    const [items, total] = await Promise.all([
      SiteSurvey.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip).limit(perPage)
        .populate({ path: 'installation', select: JOB_FIELDS, populate: [{ path: 'client', select: 'name address postcode' }, { path: 'engineer', select: 'name' }] })
        .populate('surveyor', 'name')
        .lean(),
      SiteSurvey.countDocuments(filter),
    ])
    const photoCounts = await SitePhoto.aggregate([
      { $match: { installation: { $in: items.map((s) => s.installation?._id).filter(Boolean) }, stage: 'survey' } },
      { $group: { _id: '$installation', n: { $sum: 1 } } },
    ])
    const photosBy = new Map(photoCounts.map((p) => [String(p._id), p.n]))
    for (const s of items) s.photoCount = photosBy.get(String(s.installation?._id)) || 0
    res.json({ items, total, page: Number(page) || 1, pages: Math.ceil(total / perPage) || 1 })
  } catch (err) { next(err) }
})

// The survey for an installation (created if missing), for links from the job page.
router.get('/by-installation/:installationId', async (req, res, next) => {
  try {
    if (!isId(req.params.installationId)) return res.status(404).json({ error: 'Installation not found' })
    const job = await Installation.findById(req.params.installationId).select('client products progress updatedAt')
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    const survey = await ensureSurvey(job)
    res.json({ id: survey._id, status: survey.status, progress: survey.progress, scheduledAt: survey.scheduledAt, legacy: survey.legacy })
  } catch (err) { next(err) }
})

async function loadSurvey(id) {
  if (!isId(id)) return null
  return SiteSurvey.findById(id)
}

/** A survey with its job, surveyor and progress detail, as the survey page needs it. */
async function surveyView(survey) {
  const job = await Installation.findById(survey.installation)
    .populate('client', 'name contactPerson phone email address postcode location')
    .populate('engineer', 'name')
    .lean()
  const detail = await progressFor(survey, job)
  const view = survey.toObject({ flattenMaps: true })
  await SiteSurvey.populate(view, { path: 'surveyor', select: 'name' })
  return { ...view, installation: job, detail, sections: surveySectionsFor(job?.products).map((s) => s.key) }
}

router.get('/:id', async (req, res, next) => {
  try {
    const survey = await loadSurvey(req.params.id)
    if (!survey) return res.status(404).json({ error: 'Survey not found' })
    res.json(await surveyView(survey))
  } catch (err) { next(err) }
})

// Save answers, notes and the booking. A completed survey is locked.
router.put('/:id', async (req, res, next) => {
  try {
    const survey = await loadSurvey(req.params.id)
    if (!survey) return res.status(404).json({ error: 'Survey not found' })
    if (survey.status === 'Completed') return res.status(409).json({ error: 'This survey is completed and locked.' })
    const b = req.body || {}
    if (b.answers && typeof b.answers === 'object') {
      // Only the checklist's own items for this job; blanks clear an answer.
      const job = await Installation.findById(survey.installation).select('products').lean()
      const keys = new Set(surveySectionsFor(job?.products).flatMap((s) => s.items.map((i) => i.key)))
      for (const [key, value] of Object.entries(b.answers)) {
        if (!keys.has(key)) continue
        if (value === '' || value === null || value === undefined) survey.answers.delete(key)
        else survey.answers.set(key, typeof value === 'string' ? value.slice(0, 2000) : value)
      }
    }
    if ('notes' in b) survey.notes = String(b.notes || '').slice(0, 5000)
    if ('scheduledAt' in b) survey.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : undefined
    if ('surveyor' in b) survey.surveyor = isId(b.surveyor) ? b.surveyor : undefined
    await refreshSurvey(survey)
    res.json(await surveyView(survey))
  } catch (err) { next(err) }
})

// Complete the survey: every required item and photo must be done. Ticks the
// job's "Site / roof survey" step, so it's for engineers (and admins).
router.post('/:id/complete', async (req, res, next) => {
  try {
    if (!userCan(req.user, 'installationProgress', 'update')) {
      return res.status(403).json({ error: 'Only engineers can complete a site survey.' })
    }
    const survey = await loadSurvey(req.params.id)
    if (!survey) return res.status(404).json({ error: 'Survey not found' })
    if (survey.status === 'Completed') return res.json(await surveyView(survey))
    const job = await Installation.findById(survey.installation)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    if (job.status === 'On Hold') return res.status(409).json({ error: 'This job is on hold. Resume it before completing the survey.' })

    const p = await refreshSurvey(survey, job)
    if (p.missing.length) {
      return res.status(409).json({ error: p.missing.length + ' required item' + (p.missing.length === 1 ? '' : 's') + ' still to do: ' + p.missing.slice(0, 3).map((m) => m.label).join('; ') + (p.missing.length > 3 ? '...' : '') })
    }
    survey.status = 'Completed'
    survey.completedAt = new Date()
    survey.completedBy = req.user.name
    await survey.save()
    if (!job.progress.get('siteSurveyCompleted')) {
      job.progress.set('siteSurveyCompleted', true)
      job.$locals.fromSurvey = true
      await job.save()
    }
    await Activity.create({ type: 'installation', text: 'Site survey completed for ' + job.installNo, refId: job._id, by: req.user.name })
    res.json(await surveyView(survey))
  } catch (err) { next(err) }
})

export default router
