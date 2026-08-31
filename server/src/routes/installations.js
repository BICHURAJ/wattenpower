import express from 'express'
import Installation from '../models/Installation.js'
import Certification from '../models/Certification.js'
import Activity from '../models/Activity.js'
import { crudRouter } from '../middleware/crud.js'

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

router.use('/', crudRouter(Installation, {
  searchFields: ['installNo', 'site', 'chargerModel'],
  populate: [{ path: 'client', select: 'name' }, { path: 'engineer', select: 'name' }],
  defaultSort: '-installDate',
  afterCreate: async (doc) => {
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + doc.installNo + ' scheduled',
      refId: doc._id,
    })
  },
}))

export default router
