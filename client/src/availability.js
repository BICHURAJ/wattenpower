import { inputDate, shortDate } from './api'

// Engineer availability rules, shared by the Engineers page and the dashboard
// so both always agree on who can be booked on a given day.

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const defaultWeek = () => WEEK_DAYS.map((day) => ({ day, working: !['Sat', 'Sun'].includes(day), start: '08:00', end: '17:00' }))

// Engineers saved before availability existed have no schedule; treat them as Mon-Fri.
export const scheduleOf = (engineer) => {
  const saved = engineer.weeklySchedule || []
  return WEEK_DAYS.map((day) => saved.find((d) => d.day === day) || defaultWeek().find((d) => d.day === day))
}

// Time-off dates are stored as UTC midnight, so compare them as yyyy-mm-dd strings.
const dayKey = (date) => inputDate(date)

/** Local calendar day as yyyy-mm-dd (not UTC, or late-evening checks drift a day). */
export const localDayKey = (date = new Date()) =>
  date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')

export const weekdayIndex = (date = new Date()) => (date.getDay() + 6) % 7

export function timeOffOn(engineer, date = new Date()) {
  const key = localDayKey(date)
  return (engineer.timeOff || []).find((t) => dayKey(t.from) <= key && dayKey(t.to) >= key)
}

export function nextTimeOff(engineer) {
  const today = localDayKey()
  return (engineer.timeOff || [])
    .filter((t) => dayKey(t.from) > today)
    .sort((a, b) => new Date(a.from) - new Date(b.from))[0]
}

/**
 * Whether an engineer can be booked on a given day, and if not, why.
 * `kind` is one of: working | time-off | off-duty | day-off.
 */
export function availabilityOn(engineer, date = new Date()) {
  const off = timeOffOn(engineer, date)
  if (off) return { working: false, kind: 'time-off', tone: 'amber', reason: off.reason || 'Time off', label: (off.reason || 'Time off') + ' until ' + shortDate(off.to) }

  // "Off Duty" is a live status, so it only applies to today.
  if (engineer.status === 'Off Duty' && localDayKey(date) === localDayKey()) {
    return { working: false, kind: 'off-duty', tone: 'red', reason: 'Off duty', label: 'Off duty today' }
  }

  const day = scheduleOf(engineer)[weekdayIndex(date)]
  if (!day.working) return { working: false, kind: 'day-off', tone: 'slate', reason: 'Not a working day', label: 'Not working today' }
  return { working: true, kind: 'working', tone: 'green', reason: '', label: 'Working today · ' + day.start + '–' + day.end, start: day.start, end: day.end }
}

export const availabilityToday = (engineer) => availabilityOn(engineer, new Date())

export const weeklyHours = (schedule) => schedule.reduce((sum, d) => {
  if (!d.working || !d.start || !d.end) return sum
  const [sh, sm] = d.start.split(':').map(Number)
  const [eh, em] = d.end.split(':').map(Number)
  return sum + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}, 0)

export const hoursLabel = (schedule) => weeklyHours(schedule).toFixed(1).replace(/\.0$/, '')
