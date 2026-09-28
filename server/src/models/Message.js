import mongoose from 'mongoose'

export const MAX_MESSAGE_LENGTH = 2000

// One message in a Conversation.
const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
}, { timestamps: true })

MessageSchema.index({ conversation: 1, createdAt: -1 })

export default mongoose.model('Message', MessageSchema)
