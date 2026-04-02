const express = require('express')
const router = express.Router()
const Order = require('../models/Order')
const Customer = require('../models/Customer')
const Product = require('../models/Product')
const adminAuth = require('../middleware/auth')

// Helper: get date range from period string
function getDateRange(period) {
  const now = new Date()
  const start = new Date()
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(now.getDate() - 7)
      break
    case 'month':
      start.setMonth(now.getMonth() - 1)
      break
    case 'year':
      start.setFullYear(now.getFullYear() - 1)
      break
    case 'all':
      start.setFullYear(2020)
      break
    default:
      start.setDate(now.getDate() - 30)
  }
  return { start, end: now }
}

// Helper: group format based on period
function getGroupFormat(period) {
  if (period === 'today') return { $hour: '$createdAt' }
  if (period === 'year') return { $month: '$createdAt' }
  return { $dayOfMonth: '$createdAt' }
}

// ── GET /api/analytics/summary?period=week ────────────────────────
router.get('/summary', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const { start, end } = getDateRange(period)
    const prevStart = new Date(
      start.getTime() - (end.getTime() - start.getTime()),
    )

    const baseFilter = {
      createdAt: { $gte: start, $lte: end },
      status: { $nin: ['cancelled'] },
    }
    const prevFilter = {
      createdAt: { $gte: prevStart, $lte: start },
      status: { $nin: ['cancelled'] },
    }

    const [curr, prev, custCount, prodCount] = await Promise.all([
      Order.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
            avgOrder: { $avg: '$totalAmount' },
          },
        },
      ]),
      Order.aggregate([
        { $match: prevFilter },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
      ]),
      Customer.countDocuments({ createdAt: { $gte: start } }),
      Product.countDocuments({ inStock: true }),
    ])

    const c = curr[0] || { revenue: 0, orders: 0, avgOrder: 0 }
    const p = prev[0] || { revenue: 0, orders: 1 }

    const growth = (curr, prev) =>
      prev === 0 ? 100 : Math.round(((curr - prev) / prev) * 100)

    res.json({
      success: true,
      data: {
        revenue: Math.round(c.revenue),
        orders: c.orders,
        avgOrder: Math.round(c.avgOrder),
        newCustomers: custCount,
        activeProducts: prodCount,
        revenueGrowth: growth(c.revenue, p.revenue),
        orderGrowth: growth(c.orders, p.orders),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/analytics/revenue-chart?period=month ────────────────
router.get('/revenue-chart', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const { start, end } = getDateRange(period)

    const data = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $nin: ['cancelled'] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day:
              period === 'year'
                ? { $literal: 1 }
                : { $dayOfMonth: '$createdAt' },
            hour:
              period === 'today' ? { $hour: '$createdAt' } : { $literal: 0 },
          },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
    ])

    // Format labels
    const formatted = data.map((d) => {
      let label
      if (period === 'today') label = `${d._id.hour}:00`
      else if (period === 'year')
        label = new Date(d._id.year, d._id.month - 1).toLocaleString('en-IN', {
          month: 'short',
        })
      else label = `${d._id.day}/${d._id.month}`
      return { label, revenue: Math.round(d.revenue), orders: d.orders }
    })

    res.json({ success: true, data: formatted })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/analytics/top-products?period=month&limit=10 ─────────
router.get('/top-products', adminAuth, async (req, res) => {
  try {
    const { period = 'month', limit = 10, sortBy = 'revenue' } = req.query
    const { start, end } = getDateRange(period)

    const data = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $nin: ['cancelled'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          unitsSold: { $sum: '$items.quantity' },
          orders: { $sum: 1 },
          image: { $first: '$items.image' },
        },
      },
      { $sort: { [sortBy === 'units' ? 'unitsSold' : 'revenue']: -1 } },
      { $limit: Number(limit) },
    ])

    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/analytics/order-status-breakdown ─────────────────────
router.get('/order-status', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const { start, end } = getDateRange(period)
    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    const result = {}
    data.forEach((d) => (result[d._id] = d.count))
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/analytics/golden-nuggets — high-value insights ───────
router.get('/golden-nuggets', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const { start, end } = getDateRange(period)
    const filter = {
      createdAt: { $gte: start, $lte: end },
      status: { $nin: ['cancelled'] },
    }

    const [highTicket, frequentBuyers, peakHours, categoryRevenue] =
      await Promise.all([
        // Top 5 high-value individual orders
        Order.find(filter)
          .sort({ totalAmount: -1 })
          .limit(5)
          .select('orderId customerName totalAmount items'),

        // Customers who ordered most
        Order.aggregate([
          { $match: filter },
          {
            $group: {
              _id: '$customerPhone',
              name: { $first: '$customerName' },
              orders: { $sum: 1 },
              spent: { $sum: '$totalAmount' },
            },
          },
          { $sort: { orders: -1 } },
          { $limit: 5 },
        ]),

        // Peak ordering hours
        Order.aggregate([
          { $match: filter },
          { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 3 },
        ]),

        // Revenue by category (from items)
        Order.aggregate([
          { $match: filter },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.name',
              revenue: {
                $sum: { $multiply: ['$items.price', '$items.quantity'] },
              },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]),
      ])

    res.json({
      success: true,
      data: { highTicket, frequentBuyers, peakHours, categoryRevenue },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/analytics/category-breakdown ─────────────────────────
router.get('/category-breakdown', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const { start, end } = getDateRange(period)
    const data = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $nin: ['cancelled'] },
        },
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$product.category', 'unknown'] },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          unitsSold: { $sum: '$items.quantity' },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
