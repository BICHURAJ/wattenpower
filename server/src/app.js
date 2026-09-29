import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import apiRoutes from './routes/index.js'
import Lead from './models/Lead.js'
import Activity from './models/Activity.js'
import { normaliseProducts, processesForClient } from './processes.js'

/**
 * The Express app, without connecting to the database or listening, so tests
 * can build one. `config` comes from loadConfig().
 */
export function createApp(config) {
  const app = express()
  // Behind nginx (Docker), take the visitor's IP from X-Forwarded-For -- but only
  // from the configured number of proxies, so it can't be spoofed from outside.
  app.set('trust proxy', config.trustProxy ?? false)

  // Only the listed origins get CORS headers (matched exactly). Auth is a
  // bearer token, not a cookie, so credentials stay off. Methods and headers
  // are the ones the web app sends.
  app.use(cors({
    origin: [...config.corsOrigins],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  }))
  // Photos (base64) have their own, bigger limit in routes/photos.js.
  const json = express.json({ limit: '2mb' })
  app.use((req, res, next) => (req.path.startsWith('/api/photos') ? next() : json(req, res, next)))
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'))

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'watten-power-api' }))

  // Products and their process steps (processes.js). Public: the website enquiry
  // form needs the product list, and it's configuration, not data.
  app.get('/api/public/processes', (req, res) => res.json(processesForClient()))

  // The website lead form is public -- a prospective customer is not signed in.
  // This is the "Website (Lead Capture)" node on the workflow diagram.
  app.post('/api/public/leads', async (req, res, next) => {
    try {
      // Only the form's own fields -- a visitor can't set status, source or links to clients.
      const b = req.body || {}
      const lead = await Lead.create({
        fullName: b.fullName, email: b.email, phone: b.phone,
        address: b.address, postcode: b.postcode, location: b.location,
        leadType: b.leadType, preferredContactMethod: b.preferredContactMethod, message: b.message,
        products: normaliseProducts(b.products, { allowEmpty: true }),
        source: 'Website',
      })
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

  return app
}
