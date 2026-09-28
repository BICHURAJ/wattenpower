import mongoose from 'mongoose'

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Standard Mon-Fri, 8 till 5 -- what most engineers work unless told otherwise.
export const defaultWeek = () => WEEK_DAYS.map((day) => ({
  day, working: !['Sat', 'Sun'].includes(day), start: '08:00', end: '17:00',
}))

const DaySchema = new mongoose.Schema({
  day: { type: String, enum: WEEK_DAYS, required: true },
  working: { type: Boolean, default: false },
  start: { type: String, default: '08:00' },
  end: { type: String, default: '17:00' },
}, { _id: false })

const TimeOffSchema = new mongoose.Schema({
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  reason: { type: String, default: 'Holiday' },
})

const EngineerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  role: { type: String, default: 'Installation Engineer' },
  certifications: [{ name: String, body: String, number: String, expiryDate: Date }],
  // Live state right now (e.g. out on a job).
  status: { type: String, enum: ['Available', 'On Job', 'Off Duty'], default: 'Available' },
  // Planned availability: the usual working week plus any booked time off.
  weeklySchedule: { type: [DaySchema], default: defaultWeek },
  timeOff: [TimeOffSchema],
  coverageArea: String,
}, { timestamps: true })

export default mongoose.model('Engineer', EngineerSchema)
