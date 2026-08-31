import express from 'express'
import Client from '../models/Client.js'
import Quotation from '../models/Quotation.js'
import Installation from '../models/Installation.js'
import Ticket from '../models/Ticket.js'
import Activity from '../models/Activity.js'
import ComplianceItem from '../models/ComplianceItem.js'

const router = express.Router()

// Screen 2: everything the dashboard needs in a single request.
router.get('/', async (req, res, next) => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [totalClients, openQuotations, installsThisMonth, openTickets, activities, upcoming, expiring] =
      await Promise.all([
        Client.countDocuments({}),
        Quotation.countDocuments({ status: { $in: ['Draft', 'Sent'] } }),
        Installation.countDocuments({ installDate: { $gte: startOfMonth, $lt: endOfMonth } }),
        Ticket.countDocuments({ status: { $in: ['Open', 'In Progress'] } }),
        Activity.find({}).sort('-createdAt').limit(6).lean(),
        Installation.find({ status: { $in: ['Scheduled', 'In Progress'] } })
          .sort('installDate')
          .limit(6)
          .populate('client', 'name')
          .populate('engineer', 'name')
          .lean(),
        ComplianceItem.find({ status: { $in: ['Expiring Soon', 'Expired'] } }).sort('expiryDate').limit(5).lean(),
      ])

    res.json({
      stats: { totalClients, openQuotations, installsThisMonth, openTickets },
      activities,
      upcoming,
      expiring,
    })
  } catch (err) { next(err) }
})

// Screen: Reports -- simple aggregate counts used by the reports page.
router.get('/reports', async (req, res, next) => {
  try {
    const [quotesByStatus, installsByStatus, ticketsByPriority, revenue] = await Promise.all([
      Quotation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } }]),
      Installation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Quotation.aggregate([
        { $match: { status: 'Accepted' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ])

    res.json({
      quotesByStatus,
      installsByStatus,
      ticketsByPriority,
      acceptedValue: revenue[0]?.total || 0,
    })
  } catch (err) { next(err) }
})

export default router
