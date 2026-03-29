const express = require('express');
const router  = express.Router();
const HeroBanner = require('../models/HeroBanner');
const adminAuth  = require('../middleware/auth');

// GET /api/hero — public
router.get('/', async (req, res) => {
  try {
    const banners = await HeroBanner.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, data: banners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hero/admin — admin (all)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const banners = await HeroBanner.find().sort({ sortOrder: 1 });
    res.json({ success: true, data: banners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hero — admin create
router.post('/', adminAuth, async (req, res) => {
  try {
    const { title, image } = req.body;
    if (!title || !image) return res.status(400).json({ success: false, message: 'Title and image required' });
    const banner = await HeroBanner.create(req.body);
    res.status(201).json({ success: true, data: banner, message: 'Banner created' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/hero/:id — admin update
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const banner = await HeroBanner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    res.json({ success: true, data: banner, message: 'Banner updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/hero/:id/toggle — admin toggle active
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    banner.isActive = !banner.isActive;
    await banner.save();
    res.json({ success: true, data: banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/hero/:id — admin delete
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await HeroBanner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
