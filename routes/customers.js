const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Customer = require('../models/Customer')
const Order = require('../models/Order')
const OTP = require('../models/OTP')
const { sendOTP, sendWhatsAppMessage } = require('../services/whatsapp')
const { otpLimiter, otpVerifyLimiter } = require('../middleware/rateLimit')
const adminAuth = require('../middleware/auth')

// ── Normalize phone to "91XXXXXXXXXX" format ────────────────────
function normalizePhone(phone) {
  const d = String(phone || '').replace(/[^0-9]/g, '')
  if (d.length === 10) return '91' + d
  if (d.length === 12 && d.startsWith('91')) return d
  return null
}
function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// ── Customer JWT middleware ──────────────────────────────────────
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
    return res.status(400).json({ success: false, message: 'Phone required' })
  const normalized = normalizePhone(phone)
  if (!normalized)
    return res
      .status(400)
      .json({ success: false, message: 'Invalid phone number' })
  try {
    await OTP.deleteMany({ phone: normalized })
    const otp = generateOTP()
    await OTP.create({ phone: normalized, otp })
    await sendOTP(normalized, otp)
    console.log('[OTP] Phone:', normalized, '| Code:', otp)
    const isDev = process.env.NODE_ENV !== 'production'
    const waSet = !!(
      process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
    )
    res.json({
      success: true,
      phone: normalized,
      message: 'OTP sent',
      ...(!waSet || isDev ? { otp } : {}),
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
        .json({ success: false, message: 'OTP expired. Request a new one.' })
    if (record.attempts >= 5) {
      await OTP.deleteOne({ _id: record._id })
      return res
        .status(400)
        .json({
          success: false,
          message: 'Too many attempts. Request new OTP.',
        })
    }
    if (record.otp !== String(otp)) {
      await OTP.findByIdAndUpdate(record._id, { $inc: { attempts: 1 } })
      return res
        .status(400)
        .json({
          success: false,
          message: 'Wrong OTP. ' + (4 - record.attempts) + ' attempts left.',
        })
    }
    await OTP.findByIdAndUpdate(record._id, { verified: true })
    let customer = await Customer.findOne({ phone: normalized })
    if (!customer)
      customer = await Customer.create({
        phone: normalized,
        name: name || '',
        lastLogin: new Date(),
      })
    else {
      customer.lastLogin = new Date()
      if (name && !customer.name) customer.name = name
      await customer.save()
    }
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
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/customers/me ────────────────────────────────────────
router.get('/me', customerAuth, async (req, res) => {
  try {
    const c = await Customer.findById(req.customer.customerId)
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

// ── GET /api/customers — admin list with stats ───────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 30, search, sort = 'newest', period } = req.query
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

// ── GET /api/customers/:id — admin: full customer detail ─────────
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id
    let customer
    if (mongoose.Types.ObjectId.isValid(id)) {
      customer = await Customer.findById(id)
    }
    if (!customer) {
      // Try by phone
      const norm = normalizePhone(id)
      if (norm) customer = await Customer.findOne({ phone: norm })
    }
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: 'Customer not found' })

    // Get all orders by this customer's phone
    const phoneDigits = customer.phone.replace(/[^0-9]/g, '').slice(-10)
    const orders = await Order.find({
      $or: [
        { customer: customer._id },
        { customerPhone: { $regex: phoneDigits, $options: 'i' } },
      ],
    }).sort({ createdAt: -1 })

    // Compute lifetime stats from actual orders
    const totalOrders = orders.length
    const totalSpent = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + (o.totalAmount || 0), 0)

    res.json({
      success: true,
      data: { ...customer.toObject(), totalOrders, totalSpent },
      orders,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/customers/manual — admin add/update by phone ───────
router.post('/manual', adminAuth, async (req, res) => {
  try {
    const { name, phone, address, pincode, city, landmark } = req.body
    if (!phone)
      return res.status(400).json({ success: false, message: 'Phone required' })
    const normalized = normalizePhone(phone)
    if (!normalized)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid phone number' })

    let customer = await Customer.findOne({ phone: normalized })
    let isNew = false

    if (customer) {
      if (name?.trim()) customer.name = name.trim()
      if (address && pincode) {
        const dup = customer.addresses.some(
          (a) => a.pincode === pincode.trim() && a.address === address.trim(),
        )
        if (!dup)
          customer.addresses.push({
            label: 'Home',
            address: address.trim(),
            landmark: landmark || '',
            pincode: pincode.trim(),
            city: city || '',
            isDefault: customer.addresses.length === 0,
          })
      }
      await customer.save()
    } else {
      isNew = true
      const data = { phone: normalized, name: name?.trim() || '' }
      if (address && pincode)
        data.addresses = [
          {
            label: 'Home',
            address: address.trim(),
            landmark: landmark || '',
            pincode: pincode.trim(),
            city: city || '',
            isDefault: true,
          },
        ]
      customer = await Customer.create(data)
    }

    // Also link any existing orders by phone
    const phoneDigits = normalized.slice(-10)
    await Order.updateMany(
      { customerPhone: { $regex: phoneDigits, $options: 'i' }, customer: null },
      { $set: { customer: customer._id } },
    )

    // Recompute order stats
    const orders = await Order.find({
      $or: [
        { customer: customer._id },
        { customerPhone: { $regex: phoneDigits, $options: 'i' } },
      ],
    })
    const totalOrders = orders.length
    const totalSpent = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + (o.totalAmount || 0), 0)
    await Customer.findByIdAndUpdate(customer._id, { totalOrders, totalSpent })

    res
      .status(isNew ? 201 : 200)
      .json({
        success: true,
        data: customer,
        action: isNew ? 'created' : 'updated',
        message: isNew ? 'Customer added' : 'Customer updated',
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

module.exports = router
