const rateLimit = require('express-rate-limit')

// ── OTP requests — strictest: 3 per 15 min per IP ────────────────
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── OTP verify — 5 attempts per 15 min ───────────────────────────
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many verification attempts. Please request a new OTP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── Admin login — 10 attempts per hour ───────────────────────────
const adminLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts. Try again in 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── General API — 200 req per 15 min ─────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/health'), // skip health checks
})

// ── Order creation — 20 orders per hour per IP ───────────────────
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many orders from this device. Please try later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  otpLimiter,
  otpVerifyLimiter,
  adminLoginLimiter,
  generalLimiter,
  orderLimiter,
}
