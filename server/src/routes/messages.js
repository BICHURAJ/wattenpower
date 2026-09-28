import express from 'express'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Conversation from '../models/Conversation.js'
import Message, { MAX_MESSAGE_LENGTH } from '../models/Message.js'
import { subscribe, publish } from '../messageHub.js'

// Private one-to-one messages between users. Every signed-in user can use
// them; a conversation is only ever returned to its two participants.
// New messages and read receipts are pushed over /stream, so the web app
// doesn't need to keep asking.
const router = express.Router()

const HEARTBEAT_MS = 25000

const PAGE = 100
const person = (u) => (u ? { id: u._id, name: u.name, role: u.role, initials: u.initials, active: u.status === 'active' } : null)
const isId = (id) => mongoose.isValidObjectId(id)

/** The conversation if the signed-in user is in it; otherwise null (reported as 404). */
async function ownConversation(req) {
  if (!isId(req.params.id)) return null
  return Conversation.findOne({ _id: req.params.id, participants: req.user._id })
}

const otherIn = (conversation, userId) => conversation.participants.find((p) => String(p._id || p) !== String(userId))

/**
 * Marks the conversation read by `userId` up to `at`, and tells the other
 * person ("Seen") and the reader's other tabs (their unread badge).
 */
async function markRead(conversation, userId, at) {
  if (!at || at <= conversation.readAtFor(userId)) return
  conversation.markRead(userId, at)
  await conversation.save()
  const other = otherIn(conversation, userId)
  if (other) publish([other._id || other], { type: 'read', conversationId: String(conversation._id), at })
  publish([userId], { type: 'read-self', conversationId: String(conversation._id) })
}

async function unreadIn(conversation, userId) {
  return Message.countDocuments({
    conversation: conversation._id,
    sender: { $ne: userId },
    createdAt: { $gt: conversation.readAtFor(userId) },
  })
}

// The push channel: one long-lived Server-Sent Events response per open app.
// Events: "message" (new message in one of your conversations), "read" (the
// other person read your messages), "read-self" (you read one in another tab).
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let a proxy (e.g. nginx) hold events back
  })
  res.flushHeaders()
  res.write('retry: 5000\n: connected\n\n')
  const unsubscribe = subscribe(req.user._id, res)
  // A comment line now and then keeps idle connections from being cut by proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  req.on('close', () => { clearInterval(heartbeat); unsubscribe() })
})

// People you can start a conversation with: other active users.
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id }, status: 'active', role: { $exists: true } }).sort('name')
    res.json({ items: users.map(person) })
  } catch (err) { next(err) }
})

// Total unread, for the badge in the top bar.
router.get('/unread', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
    const counts = await Promise.all(conversations.map((c) => unreadIn(c, req.user._id)))
    res.json({ unread: counts.reduce((a, b) => a + b, 0) })
  } catch (err) { next(err) }
})

// Your conversations, most recent first, with the other person and unread counts.
router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id, lastMessageAt: { $ne: null } })
      .sort('-lastMessageAt')
      .populate('participants', 'name role initials status')
    const items = await Promise.all(conversations.map(async (c) => ({
      id: c._id,
      with: person(c.participants.find((p) => String(p._id) !== String(req.user._id))),
      lastMessage: c.lastMessage?.body || '',
      lastFromMe: String(c.lastMessage?.sender) === String(req.user._id),
      lastMessageAt: c.lastMessageAt,
      unread: await unreadIn(c, req.user._id),
    })))
    res.json({ items })
  } catch (err) { next(err) }
})

// Open (or start) the conversation with another user.
router.post('/conversations', async (req, res, next) => {
  try {
    const otherId = req.body.userId
    if (!isId(otherId)) return res.status(400).json({ error: 'Choose who to message.' })
    if (String(otherId) === String(req.user._id)) return res.status(400).json({ error: "You can't message yourself." })
    const other = await User.findById(otherId)
    if (!other || other.status !== 'active' || !other.role) return res.status(400).json({ error: 'That person has no active account.' })

    const key = Conversation.keyFor(req.user._id, other._id)
    const conversation = await Conversation.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, participants: [req.user._id, other._id] } },
      { upsert: true, new: true },
    )
    res.json({ id: conversation._id, with: person(other) })
  } catch (err) { next(err) }
})

// Messages in a conversation (newest PAGE, oldest first), or only those newer
// than ?after= when polling. Reading marks the conversation as read.
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await ownConversation(req)
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
    await conversation.populate('participants', 'name role initials status')

    const filter = { conversation: conversation._id }
    const after = req.query.after ? new Date(req.query.after) : null
    if (after && !Number.isNaN(after.getTime())) filter.createdAt = { $gt: after }
    const messages = (await Message.find(filter).sort('-createdAt').limit(PAGE).lean()).reverse()

    // Mark as read up to the newest message shown (not "now", so nothing sent meanwhile is skipped).
    await markRead(conversation, req.user._id, messages[messages.length - 1]?.createdAt)

    const other = conversation.participants.find((p) => String(p._id) !== String(req.user._id))
    res.json({
      id: conversation._id,
      with: person(other),
      // When the other person last read it, so "Seen" can show on your messages.
      theirReadAt: other ? conversation.readAtFor(other._id) : null,
      messages: messages.map((m) => ({ id: m._id, body: m.body, mine: String(m.sender) === String(req.user._id), createdAt: m.createdAt })),
    })
  } catch (err) { next(err) }
})

// Mark read up to a message you've seen (when it arrived by push while the chat was open).
router.post('/conversations/:id/read', async (req, res, next) => {
  try {
    const conversation = await ownConversation(req)
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
    const newest = await Message.findOne({ conversation: conversation._id }).sort('-createdAt').select('createdAt').lean()
    await markRead(conversation, req.user._id, newest?.createdAt)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Send a message.
router.post('/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await ownConversation(req)
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
    const body = String(req.body.body ?? '').trim()
    if (!body) return res.status(400).json({ error: 'Type a message first.' })
    if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Messages can be up to ' + MAX_MESSAGE_LENGTH + ' characters.' })

    const message = await Message.create({ conversation: conversation._id, sender: req.user._id, body })
    conversation.lastMessageAt = message.createdAt
    conversation.lastMessage = { body: body.slice(0, 140), sender: req.user._id }
    conversation.markRead(req.user._id, message.createdAt) // your own message counts as read
    await conversation.save()

    // Push it to the other person, and to the sender's other open tabs.
    const pushed = { id: String(message._id), body: message.body, createdAt: message.createdAt }
    const from = { id: String(req.user._id), name: req.user.name, initials: req.user.initials }
    const other = otherIn(conversation, req.user._id)
    if (other) publish([other], { type: 'message', conversationId: String(conversation._id), from, message: { ...pushed, mine: false } })
    publish([req.user._id], { type: 'message', conversationId: String(conversation._id), from, message: { ...pushed, mine: true } })

    res.status(201).json({ ...pushed, mine: true })
  } catch (err) { next(err) }
})

export default router
