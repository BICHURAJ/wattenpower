import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import { connectDB } from './db.js'
import apiRoutes from './routes/index.js'
import Lead from './models/Lead.js'
import Activity from './models/Activity.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'watten-power-api' }))

// The website lead form is public -- a prospective customer is not signed in.
// This is the "Website (Lead Capture)" node on the workflow diagram.
app.post('/api/public/leads', async (req, res, next) => {
  try {
    const lead = await Lead.create({ ...req.body, source: req.body.source || 'Website' })
    await Activity.create({ type: 'lead', text: 'New website enquiry from ' + lead.fullName, refId: lead._id })
    res.status(201).json({ ok: true, id: lead._id })
  } catch (err) { next(err) }
})

app.use('/api', apiRoutes)

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found: ' + req.method + ' ' + req.originalUrl }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  const status = err.name === 'ValidationError' ? 400 : err.status || 500
  res.status(status).json({ error: err.message || 'Something went wrong' })
})

const PORT = process.env.PORT || 4000

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log('[api] listening on http://localhost:' + PORT))
  })
  .catch((err) => {
    console.error('[db] could not connect to MongoDB:', err.message)
    console.error('[db] check that MongoDB is running and MONGODB_URI in server/.env is correct')
    process.exit(1)
  })
