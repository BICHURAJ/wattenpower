import mongoose from 'mongoose'

// Screen 16 -- the "Vans & Tools Management" node.
const VanSchema = new mongoose.Schema({
  regNo: { type: String, required: true },
  name: String,
  model: String,
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  status: { type: String, enum: ['On Road', 'In Service', 'Off Road'], default: 'On Road' },
  mileage: { type: Number, default: 0 },
  motDue: Date,
}, { timestamps: true })

export default mongoose.model('Van', VanSchema)
