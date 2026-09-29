import express from 'express'

import { requireAuth, authorize, requirePermission } from '../middleware/auth.js'
import { crudRouter } from '../middleware/crud.js'
import { userCan } from '../permissions.js'

import authRoutes from './auth.js'
import userRoutes from './users.js'
import messageRoutes from './messages.js'
import dashboardRoutes from './dashboard.js'
import quotationRoutes from './quotations.js'
import installationRoutes from './installations.js'
import siteSurveyRoutes from './siteSurveys.js'
import { engineerReport } from './engineerReport.js'
import photoRoutes from './photos.js'

import Client from '../models/Client.js'
import Lead from '../models/Lead.js'
import Engineer from '../models/Engineer.js'
import Ticket from '../models/Ticket.js'
import Grant from '../models/Grant.js'
import ComplianceItem from '../models/ComplianceItem.js'
import DocumentRef from '../models/DocumentRef.js'
import StockItem from '../models/StockItem.js'
import Van from '../models/Van.js'
import Tool from '../models/Tool.js'
import Activity from '../models/Activity.js'
import Installation from '../models/Installation.js'
import Quotation from '../models/Quotation.js'
import { clientSearch } from '../installationSearch.js'

const router = express.Router()

router.use('/auth', authRoutes)

// Everything past this point needs a signed-in user...
router.use(requireAuth)

// ...whose role allows the request (see permissions.js). Each API area is
// checked here, before any of its routes, so a new route can't miss the check.
const RESOURCES = ['dashboard', 'clients', 'leads', 'quotations', 'installations', 'tickets', 'grants',
  'engineers', 'compliance', 'documents', 'stock', 'vans', 'tools', 'activities', 'users']
for (const resource of RESOURCES) router.use('/' + resource, authorize(resource))

router.use('/users', userRoutes)
// Messages between users: open to every signed-in user, so not an area in permissions.js.
router.use('/messages', messageRoutes)

router.use('/dashboard', dashboardRoutes)
router.use('/quotations', quotationRoutes)
router.use('/installations', installationRoutes)
// Site surveys (Operations > Site Survey) and job photos (checked in photos.js).
router.use('/site-surveys', authorize('siteSurveys'), siteSurveyRoutes)
router.use('/photos', photoRoutes)

// Delete a client. Quotations, installations and support tickets must keep
// their client, so a client that has any is refused -- mark it Inactive instead.
router.delete('/clients/:id', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    const [quotations, installations, tickets] = await Promise.all([
      Quotation.countDocuments({ client: client._id }),
      Installation.countDocuments({ client: client._id }),
      Ticket.countDocuments({ client: client._id }),
    ])
    if (quotations || installations || tickets) {
      const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's')
      const linked = [
        quotations && plural(quotations, 'quotation'),
        installations && plural(installations, 'installation'),
        tickets && plural(tickets, 'support ticket'),
      ].filter(Boolean).join(', ')
      return res.status(409).json({
        error: client.name + ' has ' + linked + ' linked to it, so it cannot be deleted. Set its status to Inactive instead.',
      })
    }

    await Lead.updateMany({ convertedClient: client._id }, { $unset: { convertedClient: 1 } })
    await client.deleteOne()
    await Activity.create({ type: 'client', text: 'Client deleted: ' + client.name, by: req.user?.name })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.use('/clients', crudRouter(Client, {
  // Every word must match the client's details, products, jobs or quotes (installationSearch.js).
  search: clientSearch,
  defaultSort: 'name',
  afterCreate: async (doc) => {
    await Activity.create({ type: 'client', text: 'New client added: ' + doc.name, refId: doc._id })
  },
}))

// Screen 5: the public website lead form posts here. It is mounted again below
// the auth wall for staff, and separately as a public route in index.js.
router.use('/leads', crudRouter(Lead, {
  searchFields: ['fullName', 'email', 'phone', 'postcode'],
  filterFields: ['status', 'leadType', 'products'],
}))

// Turn a website enquiry into a real client record.
router.post('/leads/:id/convert', requirePermission('clients', 'create'), async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
    if (!lead) return res.status(404).json({ error: 'Lead not found' })

    const client = await Client.create({
      name: lead.fullName,
      contactPerson: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      postcode: lead.postcode,
      location: lead.location,
      status: 'Active',
      sites: lead.address ? [{ name: 'Main Site', address: lead.address, postcode: lead.postcode }] : [],
    })

    lead.status = 'Contacted'
    lead.convertedClient = client._id
    await lead.save()

    await Activity.create({ type: 'lead', text: 'Website lead converted to client: ' + client.name, refId: client._id })
    res.json({ lead, client })
  } catch (err) { next(err) }
})

// Engineers analytics (Engineers page and PDF report), before the /:id routes.
router.get('/engineers/report', engineerReport)
router.use('/engineers', crudRouter(Engineer, { searchFields: ['name', 'email'], defaultSort: 'name' }))

router.use('/tickets', crudRouter(Ticket, {
  searchFields: ['ticketNo', 'issue'],
  populate: [{ path: 'client', select: 'name' }, { path: 'installation', select: 'installNo' }],
  filterFields: ['status', 'priority'],
  afterCreate: async (doc) => {
    await doc.populate('client', 'name')
    await Activity.create({
      type: 'ticket',
      text: 'Warranty ticket ' + doc.ticketNo + ' raised by client ' + (doc.client?.name || ''),
      refId: doc._id,
    })
  },
}))

router.use('/grants', crudRouter(Grant, {
  populate: [{ path: 'installation', select: 'installNo client', populate: { path: 'client', select: 'name' } }],
  filterFields: ['status', 'grantType'],
}))

// Screen 13: submit the OLEV/OZEV claim. Refuses to submit until the required
// paperwork is ticked, because an incomplete claim is rejected by the scheme.
router.post('/grants/:id/submit', async (req, res, next) => {
  try {
    const grant = await Grant.findById(req.params.id).populate({
      path: 'installation',
      select: 'installNo',
    })
    if (!grant) return res.status(404).json({ error: 'Grant submission not found' })

    const missing = []
    if (!grant.customerConsent) missing.push('customer consent')
    if (!grant.documents.invoice) missing.push('invoice')
    if (!grant.documents.proofOfPayment) missing.push('proof of payment')
    if (!grant.documents.eicCertificate) missing.push('EIC certificate')
    if (missing.length) {
      return res.status(400).json({ error: 'Cannot submit yet. Still missing: ' + missing.join(', ') })
    }

    grant.status = 'Submitted'
    grant.submittedAt = new Date()
    await grant.save()

    await Activity.create({
      type: 'grant',
      text: 'OLEV grant submitted for ' + (grant.installation?.installNo || 'installation'),
      refId: grant._id,
    })
    res.json(grant)
  } catch (err) { next(err) }
})

router.use('/compliance', crudRouter(ComplianceItem, {
  searchFields: ['title', 'reference', 'relatedTo'],
  filterFields: ['status', 'category'],
  defaultSort: 'expiryDate',
}))

router.use('/documents', crudRouter(DocumentRef, { searchFields: ['title', 'category'], defaultSort: 'title' }))

router.use('/stock', crudRouter(StockItem, {
  searchFields: ['name', 'supplier'],
  filterFields: ['category'],
  defaultSort: 'name',
}))

// Delete a van. Its tools go back to the store rather than pointing at a van that no longer exists.
router.delete('/vans/:id', async (req, res, next) => {
  try {
    const van = await Van.findById(req.params.id)
    if (!van) return res.status(404).json({ error: 'Van not found' })
    await Tool.updateMany({ van: van._id }, { $unset: { van: 1 } })
    await van.deleteOne()
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.use('/vans', crudRouter(Van, {
  searchFields: ['regNo', 'model', 'name'],
  populate: [{ path: 'engineer', select: 'name' }],
  defaultSort: 'regNo',
}))

router.use('/tools', crudRouter(Tool, {
  searchFields: ['name', 'serialNo'],
  populate: [{ path: 'van', select: 'regNo name' }],
  defaultSort: 'name',
}))

// Admins see everyone's activity; other users only their own.
const ownActivity = (req) => (userCan(req.user, 'allActivity') ? {} : { user: req.user._id })
router.get('/activities/:id', async (req, res, next) => {
  try {
    const item = await Activity.findOne({ _id: req.params.id, ...ownActivity(req) }).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  } catch (err) { next(err) }
})
router.use('/activities', crudRouter(Activity, { searchFields: ['text'], filterFields: ['type'], baseFilter: ownActivity }))

// Client detail screen (4) needs the client's related records in one call.
router.get('/clients/:id/summary', async (req, res, next) => {
  try {
    // Roles that can't see quotations (engineers) don't get the client's prices either.
    const seesQuotes = userCan(req.user, 'quotations', 'read')
    const [quotations, installations, tickets] = await Promise.all([
      seesQuotes ? Quotation.find({ client: req.params.id }).sort('-createdAt').lean() : [],
      Installation.find({ client: req.params.id }).sort('-installDate').lean(),
      Ticket.find({ client: req.params.id }).sort('-createdAt').lean(),
    ])
    res.json({
      quotations,
      installations,
      tickets,
      counts: {
        quotations: quotations.length,
        installations: installations.length,
        openTickets: tickets.filter((t) => t.status !== 'Closed').length,
      },
    })
  } catch (err) { next(err) }
})

export default router
