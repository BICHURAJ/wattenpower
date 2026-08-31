import express from 'express'
import Quotation from '../models/Quotation.js'
import Installation from '../models/Installation.js'
import Activity from '../models/Activity.js'
import { crudRouter } from '../middleware/crud.js'

const router = express.Router()

// --- Workflow actions ------------------------------------------------------
// These are the arrows on the diagram between "Quotations" and the rest of the
// process, so they live as explicit endpoints rather than plain field updates.

router.post('/:id/send', async (req, res, next) => {
  try {
    const quote = await Quotation.findById(req.params.id).populate('client', 'name')
    if (!quote) return res.status(404).json({ error: 'Quotation not found' })

    quote.status = 'Sent'
    quote.history.push({ action: 'Quotation sent to client', by: req.user?.name })
    await quote.save()

    await Activity.create({
      type: 'quotation',
      text: 'Quotation ' + quote.quoteNo + ' sent to ' + (quote.client?.name || 'client'),
      refId: quote._id,
    })
    res.json(quote)
  } catch (err) { next(err) }
})

// Accepting a quote is the hand-off from the sales side of the workflow to the
// technical side -- it creates the installation job automatically.
router.post('/:id/accept', async (req, res, next) => {
  try {
    const quote = await Quotation.findById(req.params.id).populate('client', 'name')
    if (!quote) return res.status(404).json({ error: 'Quotation not found' })

    quote.status = 'Accepted'
    quote.history.push({ action: 'Quotation accepted by client', by: req.user?.name })
    await quote.save()

    let installation = await Installation.findOne({ quotation: quote._id })
    if (!installation) {
      installation = new Installation({
        client: quote.client?._id || quote.client,
        site: quote.site,
        quotation: quote._id,
        status: 'Scheduled',
        progress: { siteSurveyCompleted: true, quotationAccepted: true },
      })
      await installation.save()
      await Activity.create({
        type: 'installation',
        text: 'Installation ' + installation.installNo + ' created from quotation ' + quote.quoteNo,
        refId: installation._id,
      })
    }

    res.json({ quotation: quote, installation })
  } catch (err) { next(err) }
})

router.post('/:id/decline', async (req, res, next) => {
  try {
    const quote = await Quotation.findById(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Quotation not found' })
    quote.status = 'Declined'
    quote.history.push({ action: 'Quotation declined by client', by: req.user?.name })
    await quote.save()
    res.json(quote)
  } catch (err) { next(err) }
})

// --- Standard list / read / create / update / delete ------------------------
router.use('/', crudRouter(Quotation, {
  searchFields: ['quoteNo', 'site', 'reference'],
  populate: [{ path: 'client', select: 'name email' }],
  afterCreate: async (doc) => {
    await doc.populate('client', 'name')
    await Activity.create({
      type: 'quotation',
      text: 'Quotation ' + doc.quoteNo + ' created for client ' + (doc.client?.name || ''),
      refId: doc._id,
    })
  },
}))

export default router
