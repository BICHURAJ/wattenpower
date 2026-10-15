import express from 'express'
import mongoose from 'mongoose'
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

// --- Tasks ---------------------------------------------------------------------------
// Anyone who can edit installations works on a job's tasks (authorize() checks
// installations/update for these PUT, POST and DELETE requests).

// Standard tasks for each product, added with "Add standard tasks".
export const STANDARD_TASKS = {
  ev: ['Confirm charger model and stock', 'Confirm install date with the customer', 'Install charger and cabling',
    'Test and commission; set up the charging app', 'Register the charger and send DNO notification', 'Submit OZEV grant claim (if eligible)'],
  solar: ['Order panels, inverter and mounting kit', 'Book scaffolding', 'Submit DNO application (G98/G99)',
    'Install panels, inverter and isolators', 'Test and commission; record string readings', 'Register on MCS and issue the certificate', 'Arrange scaffolding removal'],
  battery: ['Order battery and confirm location', 'Install battery and isolation', 'Commission and set up monitoring', 'Record battery in the MCS certificate'],
}

router.post('/:id/tasks', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    const b = req.body || {}
    // { standard: true } adds the product checklist, skipping titles already on the job.
    const titles = b.standard
      ? [...new Set((job.products?.length ? job.products : ['ev']).flatMap((p) => STANDARD_TASKS[p] || []))]
          .filter((t) => !job.tasks.some((x) => x.title?.toLowerCase() === t.toLowerCase()))
      : [String(b.title || '').trim()].filter(Boolean)
    if (!titles.length) return res.status(400).json({ error: b.standard ? 'The standard tasks are already on this job.' : 'Give the task a title.' })
    for (const title of titles) {
      job.tasks.push({
        title: title.slice(0, 200),
        dueDate: b.dueDate ? new Date(b.dueDate) : undefined,
        assignedTo: mongoose.isValidObjectId(b.assignedTo) ? b.assignedTo : undefined,
        createdBy: req.user.name,
      })
    }
    await job.save()
    res.status(201).json(job.tasks)
  } catch (err) { next(err) }
})

router.put('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    const task = job?.tasks.id(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    const b = req.body || {}
    if ('title' in b) {
      const title = String(b.title || '').trim()
      if (!title) return res.status(400).json({ error: 'Give the task a title.' })
      task.title = title.slice(0, 200)
    }
    if ('dueDate' in b) task.dueDate = b.dueDate ? new Date(b.dueDate) : undefined
    if ('assignedTo' in b) task.assignedTo = mongoose.isValidObjectId(b.assignedTo) ? b.assignedTo : undefined
    if ('done' in b && Boolean(b.done) !== task.done) {
      task.done = Boolean(b.done)
      task.doneAt = task.done ? new Date() : undefined
      task.doneBy = task.done ? req.user.name : undefined
    }
    await job.save()
    res.json(job.tasks)
  } catch (err) { next(err) }
})

router.delete('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    const task = job?.tasks.id(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    task.deleteOne()
    await job.save()
    res.json(job.tasks)
  } catch (err) { next(err) }
})

// --- Notes -------------------------------------------------------------------------
// Anyone who can edit installations adds notes; you edit or delete your own,
// and people who can delete installations (admins) can remove any.

const ownNote = (req, note) => String(note.authorId) === String(req.user._id)

router.post('/:id/notes', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    const body = String(req.body?.body || '').trim()
    if (!body) return res.status(400).json({ error: 'Write a note first.' })
    job.noteLog.push({ body: body.slice(0, 4000), author: req.user.name, authorId: req.user._id })
    await job.save()
    res.status(201).json(job.noteLog)
  } catch (err) { next(err) }
})

router.put('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    const note = job?.noteLog.id(req.params.noteId)
    if (!note) return res.status(404).json({ error: 'Note not found' })
    if (!ownNote(req, note)) return res.status(403).json({ error: 'You can only edit your own notes.' })
    const body = String(req.body?.body || '').trim()
    if (!body) return res.status(400).json({ error: 'A note cannot be empty. Delete it instead.' })
    note.body = body.slice(0, 4000)
    note.editedAt = new Date()
    await job.save()
    res.json(job.noteLog)
  } catch (err) { next(err) }
})

router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    const note = job?.noteLog.id(req.params.noteId)
    if (!note) return res.status(404).json({ error: 'Note not found' })
    if (!ownNote(req, note) && !userCan(req.user, 'installations', 'delete')) return res.status(403).json({ error: 'You can only delete your own notes.' })
    note.deleteOne()
    await job.save()
    res.json(job.noteLog)
  } catch (err) { next(err) }
})

// --- DNO application / notification -------------------------------------------------

// Save the job's DNO record: { route, status, reference, submittedAt, decisionAt, notes }.
// Approval (or a confirmed notification) ticks the "DNO application" step when the
// steps before it are done, and marks the job as notified.
router.put('/:id/dno', async (req, res, next) => {
  try {
    const job = await Installation.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Installation not found' })
    const b = req.body || {}
    const before = job.dno?.status || 'Not submitted'
    const record = { ...(job.dno?.toObject?.() || {}) }
    for (const key of ['route', 'status', 'reference', 'notes']) if (key in b) record[key] = b[key] ?? ''
    for (const key of ['submittedAt', 'decisionAt']) if (key in b) record[key] = b[key] ? new Date(b[key]) : undefined
    // Sensible dates when they weren't given.
    if (record.status === 'Awaiting approval' && !record.submittedAt) record.submittedAt = new Date()
    if (['Approved', 'Rejected', 'Notified'].includes(record.status) && !record.decisionAt) record.decisionAt = new Date()
    job.dno = record
    if (['Approved', 'Notified'].includes(record.status)) {
      job.dnoNotified = true
      job.dnoNotifiedAt = job.dnoNotifiedAt || record.decisionAt
      // Tick the step when it's this job's next one (steps go in order).
      const has = stepsFor(job.products).some((st) => st.key === 'dnoApplication')
      const current = Object.fromEntries(job.progress || [])
      if (has && !current.dnoApplication && !progressOrderProblem(job.products, current, { ...current, dnoApplication: true }) && job.status !== 'On Hold') {
        job.progress.set('dnoApplication', true)
      }
    }
    await job.save()
    if (before !== record.status) {
      await Activity.create({
        type: 'compliance',
        text: 'DNO ' + (record.route ? record.route + ' ' : '') + 'for ' + job.installNo + ': ' + record.status.toLowerCase() + (record.reference ? ' (' + record.reference + ')' : ''),
        refId: job._id,
        by: req.user?.name,
      })
    }
    res.json(job)
  } catch (err) { next(err) }
})

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
      .select('installNo client engineer engineerName products status installDate completedAt progress hold postcode address handover.completedAt dno')
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
      engineer: j.engineer?.name || j.engineerName || null,
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
      const name = j.engineer?.name || j.engineerName || 'Unassigned'
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
    const dnoPending = live.filter((j) => j.status !== 'Completed' && j.dno?.status === 'Awaiting approval')
      .sort((a, b) => new Date(a.dno.submittedAt || 0) - new Date(b.dno.submittedAt || 0))
    const dnoRow = (j) => ({
      ...row(j),
      route: j.dno.route || null,
      reference: j.dno.reference || null,
      submittedAt: j.dno.submittedAt || null,
      daysWaiting: j.dno.submittedAt ? Math.floor((Date.now() - new Date(j.dno.submittedAt)) / 864e5) : null,
    })
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
        dnoPending: dnoPending.length,
        dnoRejected: live.filter((j) => j.status !== 'Completed' && j.dno?.status === 'Rejected').length,
        dnoLongestWait: dnoPending.length && dnoPending[0].dno.submittedAt ? Math.floor((Date.now() - new Date(dnoPending[0].dno.submittedAt)) / 864e5) : null,
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
      dnoPending: dnoPending.map(dnoRow),
      recentlyCompleted: completed.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)).slice(0, 10).map(row),
    })
  } catch (err) { next(err) }
})

export default router
