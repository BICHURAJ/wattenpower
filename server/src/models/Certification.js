import mongoose from 'mongoose'

// Screen 11 -- the "Installation/Certification" + "UK Electricians (NICEIC/NAPIT Certified)" nodes.
const CertificationSchema = new mongoose.Schema({
  installation: { type: mongoose.Schema.Types.ObjectId, ref: 'Installation', required: true },
  certificateNo: { type: String, required: true },
  issueDate: { type: Date, default: Date.now },
  testedBy: String,
  nextInspectionDue: Date,
  tests: {
    continuity: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'N/A' },
    insulationResistance: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'N/A' },
    earthElectrode: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'N/A' },
    rcd: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'N/A' },
    functional: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'N/A' },
  },
  certificateFileName: String,
  complete: { type: Boolean, default: false },
}, { timestamps: true })

export default mongoose.model('Certification', CertificationSchema)
