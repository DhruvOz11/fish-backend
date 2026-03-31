const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Order = require('../models/Order')
const Customer = require('../models/Customer')
const Coupon = require('../models/Coupon')
const Settings = require('../models/Settings')
const { notifyNewOrder, notifyCustomerStatus } = require('../services/whatsapp')
const adminAuth = require('../middleware/auth')
const { orderLimiter } = require('../middleware/rateLimit')

function findOrder(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return Order.findById(id).then((o) => o || Order.findOne({ orderId: id }))
  }
  return Order.findOne({ orderId: id })
}

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

// ── POST /api/orders — place order ───────────────────────────────
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
      couponCode,
      paymentMethod,
    } = req.body

    // Validate required fields
    if (!customerName?.trim())
      return res
        .status(400)
        .json({ success: false, message: 'Customer name is required' })
    if (!customerPhone?.trim())
      return res
        .status(400)
        .json({ success: false, message: 'Phone number is required' })
    if (!address?.trim())
      return res
        .status(400)
        .json({ success: false, message: 'Delivery address is required' })
    if (!pincode?.trim())
      return res
        .status(400)
        .json({ success: false, message: 'Pincode is required' })
    if (!/^\d{6}$/.test(pincode.trim()))
      return res
        .status(400)
        .json({ success: false, message: 'Invalid pincode — must be 6 digits' })
    if (!items?.length)
      return res
        .status(400)
        .json({ success: false, message: 'Order must have at least one item' })

    const settings = await Settings.getSettings()
    if (!settings.storeOpen)
      return res
        .status(400)
        .json({
          success: false,
          message: settings.storeClosedMessage || 'Store is currently closed',
        })

    const itemTotal = items.reduce(
      (s, i) => s + Number(i.price) * Number(i.quantity),
      0,
    )
    if (itemTotal <= 0)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid order total' })
    if (settings.minOrderAmount > 0 && itemTotal < settings.minOrderAmount)
      return res
        .status(400)
        .json({
          success: false,
          message: `Minimum order amount is ₹${settings.minOrderAmount}`,
        })

    // Delivery fee = 0 initially, admin sets it on confirmation
    const deliveryFee =
      settings.freeDeliveryThreshold > 0 &&
      itemTotal >= settings.freeDeliveryThreshold
        ? 0
        : settings.standardDeliveryFee

    let discount = 0,
      resolvedCoupon = ''
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
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
      if (coupon.minOrder && itemTotal < coupon.minOrder)
        return res
          .status(400)
          .json({
            success: false,
            message: `Minimum order ₹${coupon.minOrder} required for this coupon`,
          })
      if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
        return res
          .status(400)
          .json({ success: false, message: 'Coupon usage limit reached' })
      discount =
        coupon.type === 'percentage'
          ? Math.min(
              Math.round((itemTotal * coupon.discount) / 100),
              coupon.maxDiscount > 0 ? coupon.maxDiscount : Infinity,
            )
          : coupon.discount
      resolvedCoupon = coupon.code
      await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } })
    }

    const totalAmount = Math.max(0, itemTotal + deliveryFee - discount)

    const order = await Order.create({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      address: address.trim(),
      landmark: (landmark || '').trim(),
      pincode: pincode.trim(),
      city: (city || '').trim(),
      items: items.map((i) => ({
        ...i,
        price: Number(i.price),
        quantity: Number(i.quantity),
      })),
      itemTotal,
      deliveryFee,
      discount,
      couponCode: resolvedCoupon,
      totalAmount,
      deliveryType: 'standard',
      deliverySlot: 'Within 2 hours of confirmation',
      paymentMethod: paymentMethod || 'COD',
      customer: req.customer?.customerId || null,
      statusHistory: [{ status: 'pending', note: 'Order placed by customer' }],
    })

    if (req.customer?.customerId) {
      await Customer.findByIdAndUpdate(req.customer.customerId, {
        $inc: { totalOrders: 1, totalSpent: totalAmount },
      })
    }

    notifyNewOrder(order).catch(console.error)
    res
      .status(201)
      .json({
        success: true,
        data: { orderId: order.orderId, _id: order._id, totalAmount },
        message: 'Order placed! We will confirm on WhatsApp shortly.',
      })
  } catch (err) {
    console.error('Order error:', err)
    res
      .status(500)
      .json({
        success: false,
        message: 'Failed to place order. Please try again.',
      })
  }
})

// ── GET /api/orders/mine ─────────────────────────────────────────
router.get('/mine', async (req, res) => {
  try {
    const h = req.headers.authorization
    const phone = req.query.phone
    let filter = {}
    if (h?.startsWith('Bearer ')) {
      try {
        const d = jwt.verify(
          h.split(' ')[1],
          process.env.JWT_CUSTOMER_SECRET || process.env.JWT_SECRET,
        )
        filter.customer = d.customerId
      } catch {}
    }
    if (!filter.customer && phone) {
      filter.customerPhone = {
        $regex: phone.replace(/[^0-9]/g, '').slice(-10),
        $options: 'i',
      }
    }
    if (!filter.customer && !filter.customerPhone)
      return res.status(400).json({ success: false, message: 'Auth required' })
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(20)
    res.json({ success: true, data: orders })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders — admin list ─────────────────────────────────
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
      pages: Math.ceil(total / Number(limit)),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await findOrder(req.params.id)
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' })
    res.json({ success: true, data: order })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PATCH /api/orders/:id/status — admin ─────────────────────────
// When status = confirmed, admin sets delivery fee and full invoice sent to customer
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, note, cancelReason, deliveryFee } = req.body
    const valid = [
      'pending',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ]
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' })

    const order = await findOrder(req.params.id)
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' })

    order.status = status
    if (cancelReason) order.cancelReason = cancelReason

    // Admin sets delivery fee on confirmation
    if (
      status === 'confirmed' &&
      deliveryFee !== undefined &&
      deliveryFee !== null
    ) {
      const fee = parseFloat(deliveryFee)
      if (!isNaN(fee) && fee >= 0) {
        order.deliveryFee = fee
        order.totalAmount = Math.max(0, order.itemTotal + fee - order.discount)
      }
    }

    order.statusHistory.push({
      status,
      note: note || '',
      updatedAt: new Date(),
    })
    await order.save()

    // Send WhatsApp notification — confirmed sends full invoice
    notifyCustomerStatus(order).catch(console.error)

    res.json({ success: true, data: order, message: `Order ${status}` })
  } catch (err) {
    console.error('Status update error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/orders/:id/invoice — generate invoice data ──────────
router.get('/:id/invoice', async (req, res) => {
  try {
    const order = await findOrder(req.params.id)
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' })
    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        date: order.createdAt,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: `${order.address}${order.landmark ? ', ' + order.landmark : ''}, ${order.pincode}`,
        items: order.items,
        itemTotal: order.itemTotal,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        couponCode: order.couponCode,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        status: order.status,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/orders/validate-coupon ────────────────────────────
router.post('/validate-coupon', async (req, res) => {
  try {
    const { code, cartTotal } = req.body
    if (!code)
      return res.status(400).json({ success: false, message: 'Code required' })
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
    })
    if (!coupon)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid coupon code' })
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return res.status(400).json({ success: false, message: 'Coupon expired' })
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
        .json({ success: false, message: 'Usage limit reached' })
    const discount =
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
