import express from 'express'
import Installation from '../models/Installation.js'
import Client from '../models/Client.js'
import Certification from '../models/Certification.js'
import Grant from '../models/Grant.js'
import Ticket from '../models/Ticket.js'
import Activity from '../models/Activity.js'
import { crudRouter } from '../middleware/crud.js'
import { syncInstallation } from '../quoteProgress.js'
import { userCan } from '../permissions.js'
import { stepDone, progressOrderProblem } from '../processes.js'
import { installationSearch } from '../installationSearch.js'
import SiteSurvey from '../models/SiteSurvey.js'
import SitePhoto from '../models/SitePhoto.js'
import { ensureSurvey, refreshSurvey } from '../surveyService.js'
import extraRoutes from './installationExtras.js'

const router = express.Router()

// "Project Compliance Hub -- DNO Notification": tell the local electricity
// network operator about the new equipment on the supply.
router.post('/:id/dno-notify', async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })

    install.dnoNotified = true
    install.dnoNotifiedAt = new Date()
    install.dno = { ...(install.dno?.toObject?.() || {}), status: 'Notified', decisionAt: install.dnoNotifiedAt }
    await install.save()

    await Activity.create({
      type: 'compliance',
      text: 'DNO notification submitted for ' + install.installNo,
      refId: install._id,
    })
    res.json(install)
  } catch (err) { next(err) }
})

// Put a job on hold (with an optional reason), and resume it at the status it had.
// Moving a job along is the engineers' job (admins can too): see
// installationProgress in permissions.js. Others can still book and edit jobs.
const PROGRESS_FIELDS = ['progress', 'status', 'tasks', 'hold', 'completedAt']

function requireProgressRight(req, res, next) {
  if (userCan(req.user, 'installationProgress', 'update')) return next()
  res.status(403).json({ error: 'Only engineers can change the progress of a job.' })
}
// For plain create/update requests: only checked when they touch progress fields.
const guardProgressFields = (req, res, next) =>
  (PROGRESS_FIELDS.some((field) => field in (req.body || {})) ? requireProgressRight(req, res, next) : next())

// The solar/battery system design is the engineer's MCS work (systemDesign right).
const guardDesign = (req, res, next) =>
  (!('design' in (req.body || {})) || userCan(req.user, 'systemDesign', 'update')
    ? next()
    : res.status(403).json({ error: 'Only engineers can change the system design.' }))

// The handover is recorded through its own routes (installationExtras.js), never a plain update.
const dropHandover = (req, res, next) => { if (req.body) delete req.body.handover; next() }
router.post('/', dropHandover, guardProgressFields, guardDesign)
router.put('/:id', dropHandover, guardProgressFields, guardDesign)

// Handover record and the analytics report.
router.use('/', extraRoutes)

router.post('/:id/hold', requireProgressRight, async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })
    if (install.status === 'On Hold') return res.json(install)
    if (['Completed', 'Cancelled'].includes(install.status)) {
      return res.status(409).json({ error: install.status + ' jobs cannot be put on hold.' })
    }

    const reason = String(req.body?.reason || '').trim()
    install.hold = { reason, since: new Date(), previousStatus: install.status }
    install.status = 'On Hold'
    await install.save()
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + install.installNo + ' put on hold' + (reason ? ': ' + reason : ''),
      refId: install._id,
      by: req.user?.name,
    })
    res.json(install)
  } catch (err) { next(err) }
})

router.post('/:id/resume', requireProgressRight, async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })
    if (install.status !== 'On Hold') return res.json(install)

    // Jobs put on hold from the edit form have no saved status, so work one out.
    install.status = install.hold?.previousStatus ||
      (stepDone(install.progress, 'installationInProgress') ? 'In Progress' : 'Scheduled')
    install.hold = undefined
    await install.save()
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + install.installNo + ' resumed',
      refId: install._id,
      by: req.user?.name,
    })
    res.json(install)
  } catch (err) { next(err) }
})

router.get('/:id/certification', async (req, res, next) => {
  try {
    const cert = await Certification.findOne({ installation: req.params.id })
    res.json(cert || null)
  } catch (err) { next(err) }
})

// Screen 11: save the electrical installation certificate. Marking it complete
// closes the job out and pushes the installation to "Completed".
router.post('/:id/certification', requireProgressRight, async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })

    // Steps go in order: a complete certificate ticks "Testing & commissioning",
    // so everything before it must be done first.
    if (req.body?.complete) {
      const ticked = { ...Object.fromEntries(install.progress || []), testingCertification: true }
      const problem = progressOrderProblem(install.products, install.progress, ticked)
      if (problem) return res.status(409).json({ error: problem.message })
    }

    const existing = await Certification.findOne({ installation: install._id })
    const cert = existing || new Certification({
      installation: install._id,
      certificateNo: 'EIC-' + install.installNo.replace('INS-', ''),
    })
    cert.set(req.body)
    await cert.save()

    if (cert.complete && !stepDone(install.progress, 'testingCertification')) {
      // Every product's process has this step (see processes.js). Handover is
      // recorded separately (Handover tab), which then completes the job.
      install.progress.set('testingCertification', true)
      await install.save()
      await Activity.create({
        type: 'installation',
        text: 'Installation ' + install.installNo + ' certified (EIC)',
        refId: install._id,
      })
    }

    res.json({ certification: cert, installation: install })
  } catch (err) { next(err) }
})

// Delete an installation. Its certification goes with it, but grant claims and
// support tickets are records we must keep, so an installation that has any
// is refused -- mark it Cancelled instead.
router.delete('/:id', async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })

    const [grants, tickets] = await Promise.all([
      Grant.countDocuments({ installation: install._id }),
      Ticket.countDocuments({ installation: install._id }),
    ])
    if (grants || tickets) {
      const linked = [
        grants && grants + ' OZEV grant claim' + (grants === 1 ? '' : 's'),
        tickets && tickets + ' support ticket' + (tickets === 1 ? '' : 's'),
      ].filter(Boolean).join(' and ')
      return res.status(409).json({
        error: install.installNo + ' has ' + linked + ' linked to it, so it cannot be deleted. Set its status to Cancelled instead.',
      })
    }

    await Certification.deleteMany({ installation: install._id })
    await SiteSurvey.deleteMany({ installation: install._id })
    await SitePhoto.deleteMany({ installation: install._id })
    await install.deleteOne()
    await Activity.create({ type: 'installation', text: 'Installation ' + install.installNo + ' deleted', by: req.user?.name })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

const POPULATE = [
  // Address, pin and sites let the dashboard place each installation on the map.
  { path: 'client', select: 'name postcode address location sites' },
  { path: 'engineer', select: 'name phone' },
  // Its status drives the "Quotation Accepted" progress step.
  { path: 'quotation', select: 'quoteNo status' },
]

// Installation Details. The "Quotation Accepted" step follows the quotation
// linked to the job (populated as `quotation`); with none linked it stays unticked.
// System Design page: the solar / battery jobs engineers design (MCS).
// ?state=needs (design step not ticked) | done | all. Cancelled jobs and
// inactive clients are left out.
router.get('/designs', async (req, res, next) => {
  try {
    if (!userCan(req.user, 'systemDesign', 'read')) {
      return res.status(403).json({ error: 'Only engineers can see the system design queue.' })
    }
    const base = { ...(await Client.activeOnly()), products: { $in: ['solar', 'battery'] }, status: { $ne: 'Cancelled' } }
    const needs = { ...base, 'progress.systemDesigned': { $ne: true } }
    const done = { ...base, 'progress.systemDesigned': true }
    const filter = req.query.state === 'needs' ? needs : req.query.state === 'done' ? done : base
    const [items, needsCount, doneCount] = await Promise.all([
      Installation.find(filter)
        .sort({ installDate: 1, createdAt: 1 })
        .limit(500)
        .populate('client', 'name address postcode')
        .populate('engineer', 'name')
        .lean(),
      Installation.countDocuments(needs),
      Installation.countDocuments(done),
    ])
    res.json({ items, counts: { needs: needsCount, done: doneCount, all: needsCount + doneCount } })
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    let query = Installation.findById(req.params.id)
    for (const p of POPULATE) query = query.populate(p)
    const install = await query.lean()
    if (!install) return res.status(404).json({ error: 'Not found' })

    // Also keeps the stored step (used by lists and the dashboard map) in line with the quote.
    install.progress = { ...install.progress }
    await syncInstallation(install)
    res.json(install)
  } catch (err) { next(err) }
})

router.use('/', crudRouter(Installation, {
  // Every word must match the job, its client, engineer, quote or products (installationSearch.js).
  search: installationSearch,
  filterFields: ['status', 'products', 'dno.status'], // ?products=solar  ?dno.status=Awaiting approval
  populate: POPULATE,
  defaultSort: '-installDate',
  // Jobs of Inactive clients are hidden, unless a client is asked for by ?client=.
  baseFilter: () => Client.activeOnly(),
  afterCreate: async (doc) => {
    // Every job gets its site survey (Operations > Site Survey).
    await ensureSurvey(doc)
    // A new job starts with "Quotation Accepted" from its linked quote.
    await syncInstallation(doc)
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + doc.installNo + ' scheduled',
      refId: doc._id,
    })
  },
  // The linked quotation may have changed, and the step is never set by hand.
  afterUpdate: async (doc) => {
    await syncInstallation(doc)
    // Products may have changed, and with them the survey checklist.
    const survey = await SiteSurvey.findOne({ installation: doc._id })
    if (survey && survey.status !== 'Completed') await refreshSurvey(survey, doc)
  },
}))

export default router
