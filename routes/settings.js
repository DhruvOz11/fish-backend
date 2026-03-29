const express = require('express')
const router = express.Router()
const Settings = require('../models/Settings')
const adminAuth = require('../middleware/auth')

// GET /api/settings — public (frontend needs delivery fees etc.)
router.get('/', async (req, res) => {
  try {
    const s = await Settings.getSettings()
    // Return only what the frontend needs publicly
    res.json({
      success: true,
      data: {
        freeDeliveryThreshold: s.freeDeliveryThreshold,
        standardDeliveryFee: s.standardDeliveryFee,
        expressDeliveryFee: s.expressDeliveryFee,
        scheduledDeliveryFee: s.scheduledDeliveryFee,
        minOrderAmount: s.minOrderAmount,
        storeOpen: s.storeOpen,
        storeClosedMessage: s.storeClosedMessage,
        businessName: s.businessName,
        deliverySlots: s.deliverySlots,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/settings/admin — admin: full settings
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const s = await Settings.getSettings()
    res.json({ success: true, data: s })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/settings — admin: update settings
router.put('/', adminAuth, async (req, res) => {
  try {
    const s = await Settings.findOneAndUpdate({ key: 'global' }, req.body, {
      new: true,
      upsert: true,
    })
    res.json({ success: true, data: s, message: 'Settings saved' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
