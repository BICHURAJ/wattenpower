import mongoose from 'mongoose'

// A private conversation between two users. Only its participants can read it.
const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  // The two user ids, sorted and joined, so a pair only ever has one conversation.
  key: { type: String, required: true, unique: true },
  lastMessageAt: Date,
  lastMessage: { body: String, sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
  // When each participant last read it, for unread counts.
  reads: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: Date, _id: false }],
}, { timestamps: true })

ConversationSchema.index({ participants: 1, lastMessageAt: -1 })

ConversationSchema.statics.keyFor = (a, b) => [String(a), String(b)].sort().join(':')

ConversationSchema.methods.readAtFor = function (userId) {
  return this.reads.find((r) => String(r.user) === String(userId))?.at || new Date(0)
}

ConversationSchema.methods.markRead = function (userId, at = new Date()) {
  const entry = this.reads.find((r) => String(r.user) === String(userId))
  if (entry) entry.at = at
  else this.reads.push({ user: userId, at })
}

export default mongoose.model('Conversation', ConversationSchema)
