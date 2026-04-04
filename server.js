require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const path = require('path')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Apply general rate limit
try {
  const { generalLimiter } = require('./middleware/rateLimit')
  app.use(generalLimiter)
} catch (e) {
  console.warn('Rate limiter not loaded:', e.message)
}

// Static frontend
app.use(express.static(path.join(__dirname, '../public')))

// API routes — each wrapped so one bad route doesn't crash the server
function safeRoute(path, file) {
  try {
    app.use(path, require(file))
    console.log(`✅ Route loaded: ${path}`)
  } catch (e) {
    console.error(`❌ Route FAILED: ${path} →`, e.message)
    // Fallback: return proper JSON error instead of HTML
    app.use(path, (req, res) =>
      res
        .status(503)
        .json({
          success: false,
          message: `Route ${path} unavailable: ${e.message}`,
        }),
    )
  }
}

safeRoute('/api/auth', './routes/auth')
safeRoute('/api/products', './routes/products')
safeRoute('/api/categories', './routes/categories')
safeRoute('/api/orders', './routes/orders')
safeRoute('/api/customers', './routes/customers')
safeRoute('/api/coupons', './routes/coupons')
safeRoute('/api/settings', './routes/settings')
safeRoute('/api/analytics', './routes/analytics')
safeRoute('/api/issues', './routes/issues')
safeRoute('/api/onboarding', './routes/onboarding')
safeRoute('/api/hero', './routes/heroBanners')

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'FreshCatch API running',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})

// WhatsApp webhook
app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN
  )
    res.status(200).send(req.query['hub.challenge'])
  else res.sendStatus(403)
})

// SPA catch-all (MUST be after all API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ success: false, message: 'Server error' })
})

const PORT = process.env.PORT || 5000
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Atlas connected')
    app.listen(PORT, () =>
      console.log(`🚀 FreshCatch: http://localhost:${PORT}`),
    )
  })
  .catch((err) => {
    console.error('❌ MongoDB failed:', err.message)
    process.exit(1)
  })
