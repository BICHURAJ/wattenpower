import mongoose from 'mongoose'

// Screen 16 -- the "Vans & Tools Management" node.
const VanSchema = new mongoose.Schema({
  regNo: { type: String, required: true },
  name: String,
  model: String,
  engineer: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
  status: { type: String, enum: ['On Road', 'In Service', 'Off Road'], default: 'On Road' },
  mileage: { type: Number, default: 0 },
  // MOT
  motDue: Date,
  motCertificateNo: String,
  // Insurance
  insurer: String,
  insurancePolicyNo: String,
  insuranceType: { type: String, enum: ['', 'Comprehensive', 'Third Party, Fire & Theft', 'Third Party Only', 'Fleet Policy'], default: '' },
  insuranceExpiry: Date,
  notes: String,
}, { timestamps: true })

export default mongoose.model('Van', VanSchema)
