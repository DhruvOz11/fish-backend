const express = require('express')
const router = express.Router()
const OnboardingScreen = require('../models/OnboardingScreen')
const adminAuth = require('../middleware/auth')

// GET /api/onboarding — public (active only, max 3)
router.get('/', async (req, res) => {
  try {
    const screens = await OnboardingScreen.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .limit(3)
    res.json({ success: true, data: screens })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/onboarding/admin — all
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const screens = await OnboardingScreen.find().sort({ sortOrder: 1 })
    res.json({ success: true, data: screens })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/onboarding — admin create
router.post('/', adminAuth, async (req, res) => {
  try {
    const count = await OnboardingScreen.countDocuments()
    if (count >= 3)
      return res
        .status(400)
        .json({
          success: false,
          message:
            'Maximum 3 onboarding screens allowed. Delete one to add a new one.',
        })
    const { title, subtitle, image } = req.body
    if (!title)
      return res.status(400).json({ success: false, message: 'Title required' })
    const screen = await OnboardingScreen.create({
      title,
      subtitle: subtitle || '',
      image: image || '',
      sortOrder: count,
    })
    res.status(201).json({ success: true, data: screen })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/onboarding/:id — admin update
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const screen = await OnboardingScreen.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    )
    if (!screen)
      return res
        .status(404)
        .json({ success: false, message: 'Screen not found' })
    res.json({ success: true, data: screen })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/onboarding/:id — admin delete
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await OnboardingScreen.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
