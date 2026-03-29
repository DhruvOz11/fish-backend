const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Order = require('../models/Order')
const Customer = require('../models/Customer')
const Coupon = require('../models/Coupon')
const Settings = require('../models/Settings')
const { notifyNewOrder, notifyCustomerStatus } = require('../services/whatsapp')
const adminAuth = require('../middleware/auth')
const { orderLimiter } = require('../middleware/rateLimit')

function optionalCustomerAuth(req, res, next) {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) {
    try {
      req.customer = jwt.verify(
        h.split(' ')[1],
        process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
      )
    } catch {}
  }
  next()
}

// ── POST /api/orders — place order (public + optional auth) ───────
router.post('/', orderLimiter, optionalCustomerAuth, async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      address,
      landmark,
      pincode,
      city,
      items,
      deliveryType,
      couponCode,
      paymentMethod,
      deliverySlot,
    } = req.body

    // Basic validation
    if (
      !customerName ||
      !customerPhone ||
      !address ||
      !pincode ||
      !items?.length
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required order fields' })
    }

    const settings = await Settings.getSettings()
    const itemTotal = items.reduce((s, i) => s + i.price * i.quantity, 0)

    // Delivery fee logic
    const feeMap = {
      standard: settings.standardDeliveryFee,
      express: settings.expressDeliveryFee,
      scheduled: settings.scheduledDeliveryFee,
    }
    let deliveryFee = feeMap[deliveryType] ?? settings.standardDeliveryFee
    if (
      settings.freeDeliveryThreshold > 0 &&
      itemTotal >= settings.freeDeliveryThreshold
    )
      deliveryFee = 0

    // Coupon logic
    let discount = 0
    let resolvedCouponCode = ''
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
      })
      if (!coupon)
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or expired coupon' })
      if (coupon.expiresAt && coupon.expiresAt < new Date())
        return res
          .status(400)
          .json({ success: false, message: 'Coupon expired' })
      if (coupon.minOrder && itemTotal < coupon.minOrder)
        return res
          .status(400)
          .json({
            success: false,
            message: `Min order ₹${coupon.minOrder} for this coupon`,
          })
      if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
        return res
          .status(400)
          .json({ success: false, message: 'Coupon usage limit reached' })

      if (coupon.type === 'percentage') {
        discount = Math.round((itemTotal * coupon.discount) / 100)
        if (coupon.maxDiscount > 0)
          discount = Math.min(discount, coupon.maxDiscount)
      } else {
        discount = coupon.discount
      }
      resolvedCouponCode = coupon.code
      await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } })
    }

    const totalAmount = Math.max(0, itemTotal + deliveryFee - discount)

    const order = await Order.create({
      customerName,
      customerPhone,
      address,
      landmark: landmark || '',
      pincode,
      city: city || '',
      items,
      itemTotal,
      deliveryFee,
      discount,
      couponCode: resolvedCouponCode,
      totalAmount,
      deliveryType: deliveryType || 'standard',
      deliverySlot: deliverySlot || 'Tomorrow 6AM - 8AM',
      paymentMethod: paymentMethod || 'COD',
      customer: req.customer?.customerId || null,
      statusHistory: [{ status: 'pending', note: 'Order placed' }],
    })

    // Update customer stats
    if (req.customer?.customerId) {
      await Customer.findByIdAndUpdate(req.customer.customerId, {
        $inc: { totalOrders: 1, totalSpent: totalAmount },
      })
    }

    // Fire and forget — don't await so order response is instant
    notifyNewOrder(order).catch(console.error)

    res
      .status(201)
      .json({
        success: true,
        data: { orderId: order.orderId, totalAmount, _id: order._id },
        message: 'Order placed successfully!',
      })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders/mine — customer's own orders ──────────────────
router.get('/mine', async (req, res) => {
  const h = req.headers.authorization
  const phone = req.query.phone
  try {
    let filter = {}
    if (h?.startsWith('Bearer ')) {
      try {
        const d = jwt.verify(
          h.split(' ')[1],
          process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
        )
        filter.customer = d.customerId
      } catch {}
    } else if (phone) {
      filter.customerPhone = {
        $regex: phone.replace(/[^0-9]/g, ''),
        $options: 'i',
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: 'Authentication required' })
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(20)
    res.json({ success: true, data: orders })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders — admin: list all orders ──────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, from, to } = req.query
    const filter = {}
    if (status && status !== 'all') filter.status = status
    if (search)
      filter.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ]
    if (from || to) {
      filter.createdAt = {}
      if (from) filter.createdAt.$gte = new Date(from)
      if (to) filter.createdAt.$lte = new Date(to + 'T23:59:59')
    }
    const skip = (Number(page) - 1) * Number(limit)
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(filter),
    ])
    res.json({
      success: true,
      data: orders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders/:id — admin or customer ───────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      $or: [
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
        { orderId: req.params.id },
      ],
    })
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' })
    res.json({ success: true, data: order })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PATCH /api/orders/:id/status — admin update status ───────────
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, note, cancelReason } = req.body
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ]
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' })

    const order = await Order.findById(req.params.id)
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' })

    order.status = status
    if (cancelReason) order.cancelReason = cancelReason
    order.statusHistory.push({ status, note: note || '' })
    await order.save()

    // Notify customer
    notifyCustomerStatus(order).catch(console.error)

    res.json({
      success: true,
      data: order,
      message: `Order status updated to ${status}`,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders/:id/validate-coupon — validate before placing ─
router.post('/validate-coupon', async (req, res) => {
  try {
    const { code, cartTotal } = req.body
    if (!code)
      return res
        .status(400)
        .json({ success: false, message: 'Coupon code required' })
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
    })
    if (!coupon)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid coupon code' })
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return res
        .status(400)
        .json({ success: false, message: 'Coupon has expired' })
    if (coupon.minOrder && cartTotal < coupon.minOrder)
      return res
        .status(400)
        .json({
          success: false,
          message: `Minimum order ₹${coupon.minOrder} required`,
        })
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
      return res
        .status(400)
        .json({ success: false, message: 'Coupon usage limit reached' })
    let discount =
      coupon.type === 'percentage'
        ? Math.min(
            Math.round((cartTotal * coupon.discount) / 100),
            coupon.maxDiscount > 0 ? coupon.maxDiscount : Infinity,
          )
        : coupon.discount
    res.json({
      success: true,
      discount,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        description: coupon.description,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
