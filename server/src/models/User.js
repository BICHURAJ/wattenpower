import mongoose from 'mongoose'
import { ROLES, AREA_KEYS, permissionsFor, cleanAccess, roleAccess } from '../permissions.js'

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // No default: people who sign up get a role only when an admin approves them.
  role: { type: String, enum: ROLES },
  // pending = signed up, waiting for an admin; disabled = can no longer sign in.
  status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'active' },
  // Admin overrides of this user's access per tab, e.g. { quotations: 'view' }
  // (levels in permissions.js). Tabs not listed keep the role's rights.
  access: { type: mongoose.Schema.Types.Mixed, default: undefined },
  initials: String,
}, { timestamps: true })

UserSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    access: cleanAccess(this.access) ?? null,
    initials: this.initials,
    createdAt: this.createdAt,
    // What this user may do, so the web app can hide what they can't use.
    permissions: this.status === 'active' ? permissionsFor(this) : {},
  }
}

UserSchema.statics.migrateRoles = async function () {
  // Accounts from before sign-up existed have no status, and "technical" became "engineer".
  await this.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } })
  await this.updateMany({ role: 'technical' }, { $set: { role: 'engineer' } })

  // Tab lists from the earlier on/off picker become per-tab levels: a switched-off
  // tab is "none", an extra tab outside the role is "view".
  const old = await this.collection.find({ areas: { $exists: true } }).toArray()
  for (const user of old) {
    const defaults = roleAccess(user.role)
    const access = {}
    for (const key of AREA_KEYS) {
      const on = Array.isArray(user.areas) && user.areas.includes(key)
      const inRole = defaults[key].length > 0
      if (!on && inRole) access[key] = 'none'
      if (on && !inRole) access[key] = 'view'
    }
    await this.collection.updateOne(
      { _id: user._id },
      Object.keys(access).length ? { $set: { access }, $unset: { areas: '' } } : { $unset: { areas: '' } },
    )
  }
}

export default mongoose.model('User', UserSchema)
