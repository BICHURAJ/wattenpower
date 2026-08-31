import mongoose from 'mongoose'

const ToolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  serialNo: String,
  van: { type: mongoose.Schema.Types.ObjectId, ref: 'Van' },
  lastCalibration: Date,
  calibrationDue: Date,
  status: { type: String, enum: ['In Service', 'Calibration Due', 'Out of Service'], default: 'In Service' },
}, { timestamps: true })

export default mongoose.model('Tool', ToolSchema)
