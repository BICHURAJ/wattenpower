import express from 'express'
import Client from '../models/Client.js'
import Quotation from '../models/Quotation.js'
import Installation from '../models/Installation.js'
import Ticket from '../models/Ticket.js'
import Activity from '../models/Activity.js'
import ComplianceItem from '../models/ComplianceItem.js'
import { userCan } from '../permissions.js'

const router = express.Router()

// Screen 2: everything the dashboard needs in a single request.
router.get('/', async (req, res, next) => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // Installations of Inactive clients are left out of the counts and lists.
    const activeOnly = await Client.activeOnly()
    const completedFilter = { ...activeOnly, status: 'Completed' }
    const [totalClients, openQuotations, installsThisMonth, openTickets, activities, upcoming, expiring,
      completedInstalls, completedThisMonth] =
      await Promise.all([
        Client.countDocuments({}),
        Quotation.countDocuments({ status: { $in: ['Draft', 'Sent'] } }),
        Installation.countDocuments({ ...activeOnly, installDate: { $gte: startOfMonth, $lt: endOfMonth } }),
        Ticket.countDocuments({ status: { $in: ['Open', 'In Progress'] } }),
        // Admins see the whole business; everyone else sees what they did.
        Activity.find(userCan(req.user, 'allActivity') ? {} : { user: req.user._id }).sort('-createdAt').limit(50).lean(), // the panel shows 10 and scrolls
        Installation.find({ ...activeOnly, status: { $in: ['Scheduled', 'In Progress'] } })
          .sort('installDate')
          .limit(6)
          .populate('client', 'name')
          .populate('engineer', 'name')
          .lean(),
        ComplianceItem.find({ status: { $in: ['Expiring Soon', 'Expired'] } }).sort('expiryDate').limit(5).lean(),
        Installation.countDocuments(completedFilter),
        // Jobs completed before completedAt was recorded fall back to their last update.
        Installation.countDocuments({
          ...completedFilter,
          $or: [
            { completedAt: { $gte: startOfMonth, $lt: endOfMonth } },
            { completedAt: null, updatedAt: { $gte: startOfMonth, $lt: endOfMonth } },
          ],
        }),
      ])

    res.json({
      stats: { totalClients, openQuotations, installsThisMonth, openTickets, completedInstalls, completedThisMonth },
      activities,
      upcoming,
      expiring,
    })
  } catch (err) { next(err) }
})

// Screen: Reports -- simple aggregate counts used by the reports page.
router.get('/reports', async (req, res, next) => {
  try {
    const activeOnly = await Client.activeOnly()
    const [quotesByStatus, installsByStatus, ticketsByPriority, revenue] = await Promise.all([
      Quotation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } }]),
      Installation.aggregate([{ $match: activeOnly }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Quotation.aggregate([
        { $match: { status: 'Accepted' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ])

    // Quote money is for admin and finance only; everyone else gets the counts.
    const showValues = userCan(req.user, 'quoteValues')
    res.json({
      quotesByStatus: showValues ? quotesByStatus : quotesByStatus.map(({ _id, count }) => ({ _id, count })),
      installsByStatus,
      ticketsByPriority,
      ...(showValues && { acceptedValue: revenue[0]?.total || 0 }),
    })
  } catch (err) { next(err) }
})

export default router
