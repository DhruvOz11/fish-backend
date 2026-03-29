const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const auth = require('../middleware/auth');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// GET /api/categories — public
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/categories/admin — admin (all)
router.get('/admin', auth, async (req, res) => {
  try {
    const categories = await Category.find().sort({ sortOrder: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  try {
    const cat = await Category.findOne({ id: req.params.id });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/categories — admin
router.post('/', auth, [
  body('id').trim().notEmpty().toLowerCase().withMessage('Category ID required'),
  body('name').trim().notEmpty().withMessage('Name required')
], handleValidation, async (req, res) => {
  try {
    const cat = new Category(req.body);
    await cat.save();
    res.status(201).json({ success: true, data: cat, message: 'Category created' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Category ID already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/categories/:id — admin
router.put('/:id', auth, async (req, res) => {
  try {
    const cat = await Category.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: cat, message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/categories/:id — admin
router.delete('/:id', auth, async (req, res) => {
  try {
    const cat = await Category.findOneAndDelete({ id: req.params.id });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
