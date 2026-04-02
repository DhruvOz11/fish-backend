const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Customer = require('../models/Customer')
const OTP = require('../models/OTP')
const { sendOTP, sendWhatsAppMessage } = require('../services/whatsapp')
const { otpLimiter, otpVerifyLimiter } = require('../middleware/rateLimit')
const adminAuth = require('../middleware/auth')

function normalizePhone(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

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
      .json({
        success: false,
        message: 'Invalid phone number. Use 10-digit Indian mobile number.',
      })

  try {
    await OTP.deleteMany({ phone: normalized })
    const otp = generateOTP()
    await OTP.create({ phone: normalized, otp })

    // Send OTP via WhatsApp (logs to console if credentials not set)
    const waResult = await sendOTP(normalized, otp)

    const isDev = process.env.NODE_ENV !== 'production'
    const waConfigured =
      !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
      !!process.env.WHATSAPP_ACCESS_TOKEN

    // Always log OTP to server console for easy debugging
    console.log(`\n🔑 OTP for ${normalized}: ${otp}\n`)

    res.json({
      success: true,
      message: waConfigured
        ? 'OTP sent to your WhatsApp number'
        : 'OTP generated (WhatsApp not configured — check server console)',
      phone: normalized,
      whatsappSent: waResult.success,
      // Return OTP in non-production OR if WhatsApp not configured
      ...(!waConfigured || isDev
        ? {
            otp,
            note: waConfigured
              ? 'Dev mode: OTP shown in response'
              : 'WhatsApp not configured — use this OTP for testing',
          }
        : {}),
    })
  } catch (err) {
    console.error('[OTP] Error:', err)
    res
      .status(500)
      .json({
        success: false,
        message: 'Failed to generate OTP: ' + err.message,
      })
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

    if (record.attempts >= 5) {
      await OTP.deleteOne({ _id: record._id })
      return res
        .status(400)
        .json({
          success: false,
          message: 'Too many wrong attempts. Please request a new OTP.',
        })
    }

    if (record.otp !== String(otp)) {
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

    // 10-year token = effectively permanent (re-login only needed on new device)
    const token = jwt.sign(
      { customerId: customer._id, phone: customer.phone },
      process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
      { expiresIn: '3650d' },
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
    console.error('[Verify OTP] Error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/customers/me ────────────────────────────────────────
router.get('/me', customerAuth, async (req, res) => {
  try {
    const c = await Customer.findById(req.customer.customerId).select('-__v')
    if (!c)
      return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: c })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PUT /api/customers/me ────────────────────────────────────────
router.put('/me', customerAuth, async (req, res) => {
  try {
    const c = await Customer.findByIdAndUpdate(
      req.customer.customerId,
      { name: req.body.name },
      { new: true },
    )
    res.json({ success: true, data: c })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/addresses ───────────────────────────────
router.post('/addresses', customerAuth, async (req, res) => {
  try {
    const c = await Customer.findById(req.customer.customerId)
    const { label, address, landmark, pincode, city, isDefault } = req.body
    if (!address || !pincode)
      return res
        .status(400)
        .json({ success: false, message: 'Address and pincode required' })
    if (isDefault) c.addresses.forEach((a) => (a.isDefault = false))
    c.addresses.push({
      label: label || 'Home',
      address,
      landmark,
      pincode,
      city,
      isDefault: !!isDefault,
    })
    await c.save()
    res.json({ success: true, data: c.addresses })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── DELETE /api/customers/addresses/:id ─────────────────────────
router.delete('/addresses/:addrId', customerAuth, async (req, res) => {
  try {
    const c = await Customer.findById(req.customer.customerId)
    c.addresses = c.addresses.filter(
      (a) => a._id.toString() !== req.params.addrId,
    )
    await c.save()
    res.json({ success: true, data: c.addresses })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/customers — admin list ─────────────────────────────
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
    const skip = (Number(page) - 1) * Number(limit)
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    const [customers, total, repeatCount, newThisMonth] = await Promise.all([
      Customer.find(filter)
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
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

// ── POST /api/customers/marketing-blast ─────────────────────────
router.post('/marketing-blast', adminAuth, async (req, res) => {
  try {
    const { message } = req.body
    if (!message)
      return res
        .status(400)
        .json({ success: false, message: 'Message required' })
    const customers = await Customer.find({ isBlocked: false }, 'phone').lean()
    let sent = 0
    for (const c of customers) {
      if (c.phone) {
        const r = await sendWhatsAppMessage(c.phone, message)
        if (r.success) sent++
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    res.json({ success: true, sent, total: customers.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/customers/test-whatsapp — admin: verify WA config ──
router.get('/test-whatsapp', adminAuth, async (req, res) => {
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const biz = process.env.BUSINESS_WHATSAPP
  res.json({
    success: true,
    configured: !!(pid && token),
    phoneNumberId: pid ? pid.slice(0, 6) + '...' : 'NOT SET',
    accessToken: token ? token.slice(0, 10) + '...' : 'NOT SET',
    businessWhatsapp: biz || 'NOT SET',
    instructions:
      !pid || !token
        ? [
            '1. Go to developers.facebook.com',
            '2. Create App → Business type → Add WhatsApp product',
            '3. Get Phone Number ID and Permanent Access Token',
            '4. Add to your .env file and restart the server',
          ]
        : ['WhatsApp is configured ✅'],
  })
})

module.exports = router
