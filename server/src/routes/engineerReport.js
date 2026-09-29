import Engineer from '../models/Engineer.js'
import Installation from '../models/Installation.js'
import Client from '../models/Client.js'
import Ticket from '../models/Ticket.js'
import SiteSurvey from '../models/SiteSurvey.js'
import SitePhoto from '../models/SitePhoto.js'

// Engineers analytics (Engineers page and its PDF report). Every figure has a
// plain definition so it can be checked against the jobs behind it:
//   on time        completed no later than the day after the install date
//   callback rate  completed jobs that later had a support ticket raised
//   handover       completed jobs with a handover record (Handover tab)
//   photos         completed jobs with at least one completion photo
//   load           installs in the next 14 days per working day in that time

const DAY = 864e5
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null)
const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null)

/** Working days for an engineer in [from, to): their weekly schedule, less time off. */
function workingDays(engineer, from, to) {
  const working = new Set((engineer.weeklySchedule || []).filter((d) => d.working).map((d) => d.day))
  let n = 0
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    const day = new Date(t)
    if (!working.has(WEEK_DAYS[day.getDay()])) continue
    // Time off covers whole days, whatever time of day it was entered with.
    const off = (engineer.timeOff || []).some((o) => {
      const from = new Date(o.from); from.setHours(0, 0, 0, 0)
      const to = new Date(o.to); to.setHours(23, 59, 59, 999)
      return from <= day && day <= to
    })
    if (!off) n++
  }
  return n
}

export async function engineerReport(req, res, next) {
  try {
    const today = startOfToday()
    const fortnight = new Date(today.getTime() + 14 * DAY)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const sixMonths = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    const soon = new Date(today.getTime() + 60 * DAY)

    const [engineers, jobs] = await Promise.all([
      Engineer.find().sort('name').lean(),
      Installation.find({ ...(await Client.activeOnly()), status: { $ne: 'Cancelled' } })
        .select('installNo engineer status installDate completedAt handover.completedAt client')
        .populate('client', 'name')
        .lean(),
    ])
    const jobIds = jobs.map((j) => j._id)
    const [tickets, surveys, photoJobs] = await Promise.all([
      Ticket.find({ installation: { $in: jobIds } }).select('installation assignedTo status createdAt').lean(),
      SiteSurvey.find({ installation: { $in: jobIds }, status: 'Completed', legacy: { $ne: true } }).select('installation surveyor startedAt completedAt').lean(),
      SitePhoto.distinct('installation', { installation: { $in: jobIds }, stage: 'completion' }),
    ])
    const openTickets = await Ticket.find({ status: { $ne: 'Closed' }, assignedTo: { $ne: null } }).select('assignedTo').lean()
    const jobById = new Map(jobs.map((j) => [String(j._id), j]))
    const withPhotos = new Set(photoJobs.map(String))
    // Tickets raised after the job was completed = a callback.
    const callbacks = new Set(tickets
      .filter((t) => { const j = jobById.get(String(t.installation)); return j?.completedAt && new Date(t.createdAt) >= new Date(j.completedAt) })
      .map((t) => String(t.installation)))

    const months = []
    for (let i = 5; i >= 0; i--) {
      const from = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push({ month: from.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), from, to: new Date(today.getFullYear(), today.getMonth() - i + 1, 1) })
    }

    const build = (engineer, mine, mySurveys) => {
      const completed = mine.filter((j) => j.status === 'Completed')
      const timed = completed.filter((j) => j.installDate && j.completedAt)
      const onTime = timed.filter((j) => new Date(j.completedAt) <= new Date(new Date(j.installDate).setHours(0, 0, 0, 0) + 2 * DAY))
      const recent = timed.filter((j) => new Date(j.completedAt) >= sixMonths)
      const upcoming = mine.filter((j) => j.status !== 'Completed' && j.status !== 'On Hold' && j.installDate && new Date(j.installDate) >= today && new Date(j.installDate) < fortnight)
      const days = engineer ? workingDays(engineer, today, fortnight) : null
      const certs = (engineer?.certifications || []).filter((c) => c.expiryDate)
      return {
        id: engineer?._id || null,
        name: engineer?.name || 'Unassigned',
        role: engineer?.role || null,
        area: engineer?.coverageArea || null,
        status: engineer?.status || null,
        jobs: mine.length,
        active: mine.filter((j) => ['Scheduled', 'In Progress'].includes(j.status)).length,
        onHold: mine.filter((j) => j.status === 'On Hold').length,
        overdue: mine.filter((j) => ['Scheduled', 'In Progress'].includes(j.status) && j.installDate && new Date(j.installDate) < today).length,
        completed: completed.length,
        completedThisMonth: completed.filter((j) => j.completedAt && new Date(j.completedAt) >= monthStart).length,
        onTimeRate: pct(onTime.length, timed.length),
        averageDaysToComplete: avg(recent.map((j) => Math.max(0, (new Date(j.completedAt) - new Date(j.installDate)) / DAY))),
        callbackRate: pct(completed.filter((j) => callbacks.has(String(j._id))).length, completed.length),
        handoverRate: pct(completed.filter((j) => j.handover?.completedAt).length, completed.length),
        photoRate: pct(completed.filter((j) => withPhotos.has(String(j._id))).length, completed.length),
        openTickets: engineer ? openTickets.filter((t) => String(t.assignedTo) === String(engineer._id)).length : 0,
        surveysCompleted: mySurveys.length,
        averageSurveyDays: avg(mySurveys.filter((s) => s.startedAt && s.completedAt).map((s) => (new Date(s.completedAt) - new Date(s.startedAt)) / DAY)),
        upcoming: upcoming.length,
        workingDays: days,
        load: days ? Math.round((upcoming.length / days) * 100) / 100 : null,
        trend: months.map((m) => completed.filter((j) => j.completedAt && new Date(j.completedAt) >= m.from && new Date(j.completedAt) < m.to).length),
        certificationsExpired: certs.filter((c) => new Date(c.expiryDate) < today).map((c) => ({ name: c.name, expiryDate: c.expiryDate })),
        certificationsExpiring: certs.filter((c) => new Date(c.expiryDate) >= today && new Date(c.expiryDate) < soon).map((c) => ({ name: c.name, expiryDate: c.expiryDate })),
        overdueJobs: mine.filter((j) => ['Scheduled', 'In Progress'].includes(j.status) && j.installDate && new Date(j.installDate) < today)
          .map((j) => ({ installNo: j.installNo, client: j.client?.name, installDate: j.installDate })),
      }
    }

    const byEngineer = engineers.map((e) => build(
      e,
      jobs.filter((j) => String(j.engineer) === String(e._id)),
      // The survey's surveyor, or the job's engineer when none was set.
      surveys.filter((s) => String(s.surveyor || jobById.get(String(s.installation))?.engineer) === String(e._id)),
    ))
    const unassigned = jobs.filter((j) => !j.engineer)
    const team = build(null, jobs, surveys)

    res.json({
      generatedAt: new Date(),
      months: months.map((m) => m.month),
      team: { ...team, name: 'Team', engineers: engineers.length },
      engineers: byEngineer,
      unassigned: {
        jobs: unassigned.length,
        active: unassigned.filter((j) => ['Scheduled', 'In Progress'].includes(j.status)).length,
        upcoming: unassigned.filter((j) => j.status !== 'Completed' && j.installDate && new Date(j.installDate) >= today && new Date(j.installDate) < fortnight).length,
      },
    })
  } catch (err) { next(err) }
}
