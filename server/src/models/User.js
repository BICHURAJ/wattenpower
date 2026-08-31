import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'sales', 'engineer', 'technical'], default: 'admin' },
  initials: String,
}, { timestamps: true })

UserSchema.methods.toSafeJSON = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, initials: this.initials }
}

export default mongoose.model('User', UserSchema)
