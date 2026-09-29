import mongoose from 'mongoose'

export const MAX_MESSAGE_LENGTH = 2000

// One message in a Conversation.
const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Cleared when the message is deleted.
  body: { type: String, required() { return !this.deletedAt }, trim: true, maxlength: MAX_MESSAGE_LENGTH },
  // Set when the sender changes the text.
  editedAt: Date,
  // Set when the sender deletes it: it stays in the thread as "This message was deleted".
  deletedAt: Date,
  // People who deleted it just for themselves ("Delete for me").
  hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

MessageSchema.index({ conversation: 1, createdAt: -1 })

export default mongoose.model('Message', MessageSchema)
