import mongoose from 'mongoose'

const EngineerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  role: { type: String, default: 'Installation Engineer' },
  certifications: [{ name: String, body: String, number: String, expiryDate: Date }],
  status: { type: String, enum: ['Available', 'On Job', 'Off Duty'], default: 'Available' },
}, { timestamps: true })

export default mongoose.model('Engineer', EngineerSchema)
