const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const Coupon = require('../models/Coupon')
const adminAuth = require('../middleware/auth')

const handle = (req, res, next) => {
  const e = validationResult(req)
  if (!e.isEmpty())
    return res.status(400).json({ success: false, errors: e.array() })
  next()
}

const validate = [
  body('code')
    .trim()
    .notEmpty()
    .toUpperCase()
    .withMessage('Code required')
    .isLength({ max: 20 }),
  body('type')
    .isIn(['percentage', 'flat'])
    .withMessage('Type must be percentage or flat'),
  body('discount')
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('minOrder').optional().isFloat({ min: 0 }),
  body('maxDiscount').optional().isFloat({ min: 0 }),
]

// GET /api/coupons — admin: all coupons
router.get('/', adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 })
    res.json({ success: true, data: coupons })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/coupons/public — public: only active codes (no discount value exposed)
router.get('/public', async (req, res) => {
  try {
    const coupons = await Coupon.find(
      { isActive: true },
      'code description type minOrder maxDiscount',
    ).lean()
    res.json({ success: true, data: coupons })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/coupons
router.post('/', adminAuth, validate, handle, async (req, res) => {
  try {
    const coupon = await Coupon.create({
      ...req.body,
      code: req.body.code.toUpperCase(),
    })
    res
      .status(201)
      .json({ success: true, data: coupon, message: 'Coupon created' })
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(400)
        .json({ success: false, message: 'Coupon code already exists' })
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/coupons/:id
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!coupon)
      return res
        .status(404)
        .json({ success: false, message: 'Coupon not found' })
    res.json({ success: true, data: coupon, message: 'Coupon updated' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PATCH /api/coupons/:id/toggle
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
    if (!coupon)
      return res
        .status(404)
        .json({ success: false, message: 'Coupon not found' })
    coupon.isActive = !coupon.isActive
    await coupon.save()
    res.json({ success: true, data: coupon })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/coupons/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Coupon deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
