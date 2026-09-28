import express from 'express'
import Installation from '../models/Installation.js'
import Client from '../models/Client.js'
import Certification from '../models/Certification.js'
import Grant from '../models/Grant.js'
import Ticket from '../models/Ticket.js'
import Activity from '../models/Activity.js'
import { crudRouter } from '../middleware/crud.js'
import { syncInstallation } from '../quoteProgress.js'

const router = express.Router()

// "Project Compliance Hub -- DNO Notification": tell the local electricity
// network operator that a charger has been added to the supply.
router.post('/:id/dno-notify', async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })

    install.dnoNotified = true
    install.dnoNotifiedAt = new Date()
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
router.post('/:id/hold', async (req, res, next) => {
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

router.post('/:id/resume', async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })
    if (install.status !== 'On Hold') return res.json(install)

    // Jobs put on hold from the edit form have no saved status, so work one out.
    install.status = install.hold?.previousStatus ||
      (install.progress?.installationInProgress ? 'In Progress' : 'Scheduled')
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
router.post('/:id/certification', async (req, res, next) => {
  try {
    const install = await Installation.findById(req.params.id)
    if (!install) return res.status(404).json({ error: 'Installation not found' })

    const existing = await Certification.findOne({ installation: install._id })
    const cert = existing || new Certification({
      installation: install._id,
      certificateNo: 'EIC-' + install.installNo.replace('INS-', ''),
    })
    cert.set(req.body)
    await cert.save()

    if (cert.complete) {
      install.progress.testingCertification = true
      install.progress.handover = true
      install.status = 'Completed'
      await install.save()
      await Activity.create({
        type: 'installation',
        text: 'Installation ' + install.installNo + ' completed and certified',
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
  searchFields: ['installNo', 'site', 'chargerModel'],
  populate: POPULATE,
  defaultSort: '-installDate',
  // Jobs of Inactive clients are hidden, unless a client is asked for by ?client=.
  baseFilter: () => Client.activeOnly(),
  afterCreate: async (doc) => {
    // A new job starts with "Quotation Accepted" from its linked quote.
    await syncInstallation(doc)
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + doc.installNo + ' scheduled',
      refId: doc._id,
    })
  },
  // The linked quotation may have changed, and the step is never set by hand.
  afterUpdate: syncInstallation,
}))

export default router
