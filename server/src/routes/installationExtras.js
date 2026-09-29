import express from 'express'
import Installation from '../models/Installation.js'
import Client from '../models/Client.js'
import Activity from '../models/Activity.js'
import { userCan } from '../permissions.js'
import { stepsFor, stepDone, progressOrderProblem, PRODUCT_KEYS } from '../processes.js'
import { handoverSectionsFor, handoverProgress } from '../handoverChecklist.js'

// Installations: the handover record (per job) and the analytics report.
// Mounted by routes/installations.js before its /:id routes.
const router = express.Router()

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const needProgressRight = (req, res) => {
  if (userCan(req.user, 'installationProgress', 'update')) return true
  res.status(403).json({ error: 'Only engineers can record the handover.' })
  return false
}

// --- Handover ------------------------------------------------------------------------

function handoverView(job) {
  const answers = Object.fromEntries(job.handover?.answers || [])
  return {
    answers,
    completedAt: job.handover?.completedAt || null,
    completedBy: job.handover?.completedBy || null,
    progress: handoverProgress(job.products, answers),
    ready: !progressOrderProblem(job.products, job.progress, { ...Object.fromEntries(job.progress || []), handover: true }),
  }
}

router.get('/:id/handover', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    res.json(handoverView(job))
  } catch (err) { next(err) }
})

// Save handover answers. Locked once the handover is completed.
router.put('/:id/handover', async (req, res, next) => {
  try {
    if (!needProgressRight(req, res)) return
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    if (job.handover?.completedAt) return res.status(409).json({ error: 'The handover is completed and locked.' })
    const keys = new Set(handoverSectionsFor(job.products).flatMap((s) => s.items.map((i) => i.key)))
    if (!job.handover) job.handover = {}
    if (!job.handover.answers) job.handover.answers = new Map()
    for (const [key, value] of Object.entries(req.body?.answers || {})) {
      if (!keys.has(key)) continue
      if (value === '' || value === null || value === undefined) job.handover.answers.delete(key)
      else job.handover.answers.set(key, typeof value === 'string' ? value.slice(0, 1000) : value)
    }
    job.markModified('handover')
    await job.save()
    res.json(handoverView(job))
  } catch (err) { next(err) }
})

// Complete the handover: everything recorded, nothing failing, and every step
// before Handover done. Ticks Handover and, with every step done, completes the job.
router.post('/:id/handover/complete', async (req, res, next) => {
  try {
    if (!needProgressRight(req, res)) return
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    if (job.handover?.completedAt) return res.json(handoverView(job))
    if (job.status === 'On Hold') return res.status(409).json({ error: 'This job is on hold. Resume it before handing over.' })
    const p = handoverProgress(job.products, job.handover?.answers)
    if (p.missing.length) {
      return res.status(409).json({ error: p.missing.length + ' item(s) still to record: ' + p.missing.slice(0, 3).map((m) => m.label).join('; ') + (p.missing.length > 3 ? '...' : '') })
    }
    if (p.issues.length) return res.status(409).json({ error: 'Resolve before handing over: ' + p.issues.map((i) => i.label).join('; ') })

    const before = Object.fromEntries(job.progress || [])
    const problem = progressOrderProblem(job.products, before, { ...before, handover: true })
    if (problem) return res.status(409).json({ error: problem.message })

    job.handover.completedAt = new Date()
    job.handover.completedBy = req.user.name
    job.markModified('handover')
    job.progress.set('handover', true)
    job.$locals.fromHandover = true
    const all = { ...before, handover: true }
    const closes = !progressOrderProblem(job.products, all, all, { completing: true })
    if (closes && job.status !== 'Completed') job.status = 'Completed'
    await job.save()
    await Activity.create({
      type: 'installation',
      text: 'Installation ' + job.installNo + ' handed over' + (closes ? ' and completed' : ''),
      refId: job._id,
      by: req.user.name,
    })
    res.json({ ...handoverView(job), jobCompleted: closes })
  } catch (err) { next(err) }
})

// --- Analytics report ---------------------------------------------------------------

// Installations analytics: status mix, products, completions trend, what's
// overdue / on hold / awaiting handover, installs coming up, where active jobs
// are in the process, and each engineer's workload.
router.get('/report', async (req, res, next) => {
  try {
    const jobs = await Installation.find({ ...(await Client.activeOnly()) })
      .select('installNo client engineer products status installDate completedAt progress hold postcode address handover.completedAt')
      .populate('client', 'name postcode')
      .populate('engineer', 'name')
      .lean()
    const today = startOfToday()
    const fortnight = new Date(today.getTime() + 14 * 864e5)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const live = jobs.filter((j) => j.status !== 'Cancelled')
    const open = live.filter((j) => !['Completed'].includes(j.status))

    const statusCounts = {}
    for (const j of jobs) statusCounts[j.status] = (statusCounts[j.status] || 0) + 1

    const byProduct = Object.fromEntries(PRODUCT_KEYS.map((k) => [k, { total: 0, completed: 0 }]))
    for (const j of live) for (const p of j.products || ['ev']) if (byProduct[p]) { byProduct[p].total++; if (j.status === 'Completed') byProduct[p].completed++ }

    // The step each open job is on: its first step not yet done.
    const stageOf = (j) => {
      const steps = stepsFor(j.products)
      const next = steps.find((s) => !stepDone(j.progress, s.key))
      return next ? next.label : 'Ready to complete'
    }
    const stages = {}
    for (const j of open.filter((x) => x.status !== 'On Hold')) { const st = stageOf(j); stages[st] = (stages[st] || 0) + 1 }
    const stageOrder = [...new Set([...stepsFor(['ev', 'solar', 'battery']).map((s) => s.label), 'Ready to complete'])]
    const stageList = stageOrder.filter((l) => stages[l]).map((label) => ({ label, count: stages[label] }))

    const isOverdue = (j) => ['Scheduled', 'In Progress'].includes(j.status) && j.installDate && new Date(j.installDate) < today
    const awaitingHandover = (j) => j.status !== 'Completed' && j.status !== 'Cancelled' && stepDone(j.progress, 'testingCertification') && !stepDone(j.progress, 'handover')

    const row = (j) => ({
      id: j._id,
      installNo: j.installNo,
      client: j.client?.name,
      postcode: j.postcode || j.client?.postcode,
      products: j.products || ['ev'],
      status: j.status,
      installDate: j.installDate || null,
      completedAt: j.completedAt || null,
      engineer: j.engineer?.name || null,
      stage: j.status === 'Completed' ? 'Completed' : stageOf(j),
      holdReason: j.hold?.reason || null,
      holdSince: j.hold?.since || null,
    })

    const months = []
    for (let i = 5; i >= 0; i--) {
      const from = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1)
      months.push({
        month: from.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        completed: live.filter((j) => j.completedAt && new Date(j.completedAt) >= from && new Date(j.completedAt) < to).length,
        booked: live.filter((j) => j.installDate && new Date(j.installDate) >= from && new Date(j.installDate) < to).length,
      })
    }

    // Days from the install date to completion, for jobs completed in the last six months.
    const sixMonths = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    const durations = live
      .filter((j) => j.status === 'Completed' && j.completedAt && j.installDate && new Date(j.completedAt) >= sixMonths)
      .map((j) => (new Date(j.completedAt) - new Date(j.installDate)) / 864e5)
      .filter((d) => d >= 0)

    const people = new Map()
    for (const j of live) {
      const name = j.engineer?.name || 'Unassigned'
      if (!people.has(name)) people.set(name, { name, scheduled: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, upcoming: 0 })
      const p = people.get(name)
      if (j.status === 'Scheduled') p.scheduled++
      if (j.status === 'In Progress') p.inProgress++
      if (j.status === 'On Hold') p.onHold++
      if (j.status === 'Completed') p.completed++
      if (isOverdue(j)) p.overdue++
      if (j.status !== 'Completed' && j.installDate && new Date(j.installDate) >= today && new Date(j.installDate) < fortnight) p.upcoming++
    }
    const byEngineer = [...people.values()].sort((a, b) => (a.name === 'Unassigned') - (b.name === 'Unassigned') || (b.scheduled + b.inProgress) - (a.scheduled + a.inProgress))

    const byDate = (key) => (a, b) => new Date(a[key] || 0) - new Date(b[key] || 0)
    const completed = live.filter((j) => j.status === 'Completed')
    res.json({
      generatedAt: new Date(),
      stats: {
        total: live.length,
        active: open.filter((j) => j.status !== 'On Hold').length,
        statusCounts,
        completed: completed.length,
        completedThisMonth: completed.filter((j) => j.completedAt && new Date(j.completedAt) >= monthStart).length,
        completionRate: live.length ? Math.round((completed.length / live.length) * 100) : 0,
        overdue: live.filter(isOverdue).length,
        upcoming: open.filter((j) => j.status !== 'On Hold' && j.installDate && new Date(j.installDate) >= today && new Date(j.installDate) < fortnight).length,
        onHold: live.filter((j) => j.status === 'On Hold').length,
        awaitingHandover: live.filter(awaitingHandover).length,
        handoverRecorded: completed.filter((j) => j.handover?.completedAt).length,
        averageDaysToComplete: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
        byProduct,
      },
      stages: stageList,
      months,
      byEngineer,
      overdue: live.filter(isOverdue).sort(byDate('installDate')).map(row),
      upcoming: open.filter((j) => j.status !== 'On Hold' && j.installDate && new Date(j.installDate) >= today && new Date(j.installDate) < fortnight).sort(byDate('installDate')).map(row),
      onHold: live.filter((j) => j.status === 'On Hold').sort((a, b) => new Date(a.hold?.since || 0) - new Date(b.hold?.since || 0)).map(row),
      awaitingHandover: live.filter(awaitingHandover).sort(byDate('installDate')).map(row),
      recentlyCompleted: completed.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)).slice(0, 10).map(row),
    })
  } catch (err) { next(err) }
})

export default router
