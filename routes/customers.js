const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Customer = require('../models/Customer')
const OTP = require('../models/OTP')
const { sendOTP } = require('../services/whatsapp')
const { otpLimiter, otpVerifyLimiter } = require('../middleware/rateLimit')

// Validate Indian phone numbers
function normalizePhone(phone) {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function generateOTP(len = 6) {
  return Math.floor(
    Math.pow(10, len - 1) + Math.random() * 9 * Math.pow(10, len - 1),
  ).toString()
}

// ── POST /api/customers/send-otp ─────────────────────────────────
router.post('/send-otp', otpLimiter, async (req, res) => {
  const { phone } = req.body
  if (!phone)
    return res
      .status(400)
      .json({ success: false, message: 'Phone number required' })

  const normalized = normalizePhone(phone)
  if (!normalized)
    return res
      .status(400)
      .json({ success: false, message: 'Invalid Indian phone number' })

  try {
    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone: normalized })

    // Generate new OTP
    const otp = generateOTP(6)
    await OTP.create({ phone: normalized, otp })

    // Send via WhatsApp
    const sent = await sendOTP(normalized, otp)

    // In dev mode, return OTP in response for testing
    const isDev = process.env.NODE_ENV !== 'production'

    res.json({
      success: true,
      message: 'OTP sent to your WhatsApp',
      phone: normalized,
      ...(isDev
        ? { otp, note: 'OTP shown in dev mode only — remove in production' }
        : {}),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/verify-otp ───────────────────────────────
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  const { phone, otp, name } = req.body

  if (!phone || !otp)
    return res
      .status(400)
      .json({ success: false, message: 'Phone and OTP required' })

  const normalized = normalizePhone(phone)
  if (!normalized)
    return res
      .status(400)
      .json({ success: false, message: 'Invalid phone number' })

  try {
    const record = await OTP.findOne({
      phone: normalized,
      verified: false,
    }).sort({ createdAt: -1 })

    if (!record)
      return res
        .status(400)
        .json({
          success: false,
          message: 'OTP expired or not found. Please request a new one.',
        })

    // Max 5 attempts
    if (record.attempts >= 5) {
      await OTP.deleteOne({ _id: record._id })
      return res
        .status(400)
        .json({
          success: false,
          message: 'Too many wrong attempts. Request a new OTP.',
        })
    }

    if (record.otp !== otp.toString()) {
      await OTP.findByIdAndUpdate(record._id, { $inc: { attempts: 1 } })
      const left = 4 - record.attempts
      return res
        .status(400)
        .json({
          success: false,
          message: `Wrong OTP. ${left} attempt${left !== 1 ? 's' : ''} left.`,
        })
    }

    // OTP correct — mark used
    await OTP.findByIdAndUpdate(record._id, { verified: true })

    // Find or create customer
    let customer = await Customer.findOne({ phone: normalized })
    if (!customer) {
      customer = await Customer.create({
        phone: normalized,
        name: name || '',
        lastLogin: new Date(),
      })
    } else {
      customer.lastLogin = new Date()
      if (name && !customer.name) customer.name = name
      await customer.save()
    }

    // Issue JWT
    const token = jwt.sign(
      { customerId: customer._id, phone: customer.phone },
      process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
      { expiresIn: '30d' },
    )

    res.json({
      success: true,
      token,
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        addresses: customer.addresses,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/customers/me — get own profile ───────────────────────
router.get('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId).select(
      '-__v',
    )
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: 'Customer not found' })
    res.json({ success: true, data: customer })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PUT /api/customers/me — update name ──────────────────────────
router.put('/me', customerAuth, async (req, res) => {
  try {
    const { name } = req.body
    const customer = await Customer.findByIdAndUpdate(
      req.customer.customerId,
      { name },
      { new: true },
    )
    res.json({ success: true, data: customer })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/addresses — add address ──────────────────
router.post('/addresses', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId)
    const { label, address, landmark, pincode, city, isDefault } = req.body
    if (!address || !pincode)
      return res
        .status(400)
        .json({ success: false, message: 'Address and pincode required' })

    if (isDefault) customer.addresses.forEach((a) => (a.isDefault = false))
    customer.addresses.push({
      label: label || 'Home',
      address,
      landmark,
      pincode,
      city,
      isDefault: !!isDefault,
    })
    await customer.save()
    res.json({ success: true, data: customer.addresses })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── DELETE /api/customers/addresses/:addrId ───────────────────────
router.delete('/addresses/:addrId', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId)
    customer.addresses = customer.addresses.filter(
      (a) => a._id.toString() !== req.params.addrId,
    )
    await customer.save()
    res.json({ success: true, data: customer.addresses })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Admin: GET /api/customers — list all customers ────────────────
const adminAuth = require('../middleware/auth')
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query
    const filter = {}
    if (search)
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]
    const skip = (Number(page) - 1) * Number(limit)
    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Customer.countDocuments(filter),
    ])
    res.json({ success: true, data: customers, total })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Customer JWT middleware (inline helper) ───────────────────────
function customerAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer '))
    return res
      .status(401)
      .json({ success: false, message: 'Not authenticated' })
  try {
    const decoded = jwt.verify(
      h.split(' ')[1],
      process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
    )
    req.customer = decoded
    next()
  } catch {
    return res
      .status(401)
      .json({
        success: false,
        message: 'Session expired. Please log in again.',
      })
  }
}

module.exports = router
