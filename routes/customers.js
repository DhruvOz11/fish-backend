const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Customer = require('../models/Customer')
const OTP = require('../models/OTP')
const { sendOTP, sendWhatsAppMessage } = require('../services/whatsapp')
const { otpLimiter, otpVerifyLimiter } = require('../middleware/rateLimit')
const adminAuth = require('../middleware/auth')

// ── Phone normalizer ─────────────────────────────────────────────
function normalizePhone(phone) {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ── Customer auth middleware ─────────────────────────────────────
function customerAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer '))
    return res
      .status(401)
      .json({ success: false, message: 'Not authenticated' })
  try {
    req.customer = jwt.verify(
      h.split(' ')[1],
      process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
    )
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

// ── POST /api/customers/send-otp ────────────────────────────────
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
    await OTP.deleteMany({ phone: normalized })
    const otp = generateOTP()
    await OTP.create({ phone: normalized, otp })
    await sendOTP(normalized, otp)
    const isDev = process.env.NODE_ENV !== 'production'
    res.json({
      success: true,
      message: 'OTP sent to your WhatsApp',
      phone: normalized,
      ...(isDev ? { otp } : {}),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/verify-otp ──────────────────────────────
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  const { phone, otp, name } = req.body
  if (!phone || !otp)
    return res
      .status(400)
      .json({ success: false, message: 'Phone and OTP required' })
  const normalized = normalizePhone(phone)
  if (!normalized)
    return res.status(400).json({ success: false, message: 'Invalid phone' })

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
          message: 'OTP expired. Please request a new one.',
        })
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
    await OTP.findByIdAndUpdate(record._id, { verified: true })

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

    // Token never expires — stored in localStorage forever per requirement
    const token = jwt.sign(
      { customerId: customer._id, phone: customer.phone },
      process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
      { expiresIn: '3650d' }, // 10 years = effectively never expires
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

// ── GET /api/customers/me ────────────────────────────────────────
router.get('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId).select(
      '-__v',
    )
    if (!customer)
      return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: customer })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PUT /api/customers/me ────────────────────────────────────────
router.put('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.customer.customerId,
      { name: req.body.name },
      { new: true },
    )
    res.json({ success: true, data: customer })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/addresses ───────────────────────────────
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

// ── DELETE /api/customers/addresses/:addrId ──────────────────────
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

// ── GET /api/customers — admin list with sort + repeat stats ──────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 30, search, sort = 'newest' } = req.query
    const filter = {}
    if (search)
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      orders_desc: { totalOrders: -1 },
      spent_desc: { totalSpent: -1 },
    }
    const sortObj = sortMap[sort] || { createdAt: -1 }
    const skip = (Number(page) - 1) * Number(limit)

    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)

    const [customers, total, repeatCount, newThisMonth] = await Promise.all([
      Customer.find(filter).sort(sortObj).skip(skip).limit(Number(limit)),
      Customer.countDocuments(filter),
      Customer.countDocuments({ ...filter, totalOrders: { $gt: 1 } }),
      Customer.countDocuments({ ...filter, createdAt: { $gte: monthAgo } }),
    ])

    res.json({
      success: true,
      data: customers,
      total,
      repeatCount,
      newThisMonth,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/marketing-blast — admin ──────────────────
router.post('/marketing-blast', adminAuth, async (req, res) => {
  try {
    const { message } = req.body
    if (!message)
      return res
        .status(400)
        .json({ success: false, message: 'Message required' })

    const customers = await Customer.find({ isBlocked: false }, 'phone').lean()
    let sent = 0

    for (const customer of customers) {
      if (customer.phone) {
        const result = await sendWhatsAppMessage(customer.phone, message)
        if (result.success) sent++
        await new Promise((r) => setTimeout(r, 300)) // rate limit buffer
      }
    }

    res.json({ success: true, sent, total: customers.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
