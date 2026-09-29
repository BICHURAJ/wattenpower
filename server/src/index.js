import 'dotenv/config'

import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { connectDB } from './db.js'
import { clearUnlinkedQuoteSteps } from './quoteProgress.js'
import User from './models/User.js'
import Activity from './models/Activity.js'
import { migrateProducts } from './productMigration.js'

// Check the security settings before anything else, so a bad deploy stops here.
let config
try {
  config = loadConfig()
} catch (err) {
  console.error('[config] ' + err.message)
  process.exit(1)
}

const app = createApp(config)
const PORT = process.env.PORT || 4000

connectDB()
  .then(() => User.migrateRoles())
  .then(() => Activity.backfillUsers())
  .then(() => migrateProducts())
  .then(() => clearUnlinkedQuoteSteps())
  .then(() => {
    app.listen(PORT, () => console.log('[api] listening on http://localhost:' + PORT + ' (CORS: ' + config.corsOrigins.join(', ') + ')'))
  })
  .catch((err) => {
    console.error('[db] could not connect to MongoDB:', err.message)
    console.error('[db] check that MongoDB is running and MONGODB_URI in server/.env is correct')
    process.exit(1)
  })
