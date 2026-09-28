import mongoose from 'mongoose'
import { currentUser } from '../requestContext.js'

// Feeds the "Recent Activities" panel on the dashboard (screen 2).
const ActivitySchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ['quotation', 'installation', 'ticket', 'grant', 'client', 'lead', 'compliance'], default: 'client' },
  refId: mongoose.Schema.Types.ObjectId,
  by: String,
  // Who did it. Admins see everyone's activity; other users see their own.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true })

// Filled in from the signed-in user making the request, so every activity
// records who did it. Public actions (the website lead form) have no user.
ActivitySchema.pre('validate', function (next) {
  const user = currentUser()
  if (user && !this.user) {
    this.user = user._id
    if (!this.by) this.by = user.name
  }
  next()
})

/** Links activities saved before `user` existed to the account with the same name. */
ActivitySchema.statics.backfillUsers = async function () {
  const names = await this.distinct('by', { user: { $exists: false }, by: { $nin: [null, ''] } })
  if (!names.length) return
  const users = await mongoose.model('User').find({ name: { $in: names } }).select('name').lean()
  for (const u of users) await this.updateMany({ user: { $exists: false }, by: u.name }, { $set: { user: u._id } })
}

export default mongoose.model('Activity', ActivitySchema)
