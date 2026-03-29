const express = require('express');
const router = express.Router();
const { body, validationResult, param, query } = require('express-validator');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// ─── Validation middleware ───────────────────────────────────────
const productValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 }),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').isIn(['fish', 'prawns', 'crabs', 'squid', 'ready-to-cook', 'combos', 'dried', 'specials']).withMessage('Invalid category'),
  body('weight').trim().notEmpty().withMessage('Weight is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('originalPrice').isFloat({ min: 0 }).withMessage('Valid original price required'),
  body('stockQty').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative')
];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── GET /api/products — Public: list all active products ────────
router.get('/', async (req, res) => {
  try {
    const { category, subcategory, badge, inStock, search, page = 1, limit = 100 } = req.query;

    const filter = { isActive: true };

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (badge) filter.badge = badge;
    if (inStock === 'true') filter.inStock = true;
    if (inStock === 'false') filter.inStock = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter)
    ]);

    res.json({ success: true, data: products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/products/admin — Admin: list all including inactive ─
router.get('/admin', auth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter)
    ]);

    res.json({ success: true, data: products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/products/:id ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/products — Admin: create ─────────────────────────
router.post('/', auth, productValidation, handleValidation, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Product already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/products/:id — Admin: update ──────────────────────
router.put('/:id', auth, productValidation, handleValidation, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/products/:id/stock — Admin: toggle stock ────────
router.patch('/:id/stock', auth, async (req, res) => {
  try {
    const { inStock, stockQty } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (typeof inStock === 'boolean') product.inStock = inStock;
    if (typeof stockQty === 'number') product.stockQty = stockQty;
    await product.save();

    res.json({ success: true, data: product, message: `Stock updated` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/products/:id/price — Admin: quick price update ──
router.patch('/:id/price', auth, [
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('originalPrice').optional().isFloat({ min: 0 })
], handleValidation, async (req, res) => {
  try {
    const { price, originalPrice } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.price = price;
    if (originalPrice !== undefined) product.originalPrice = originalPrice;
    await product.save(); // pre-save hook recalculates discount

    res.json({ success: true, data: product, message: 'Price updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/products/:id/toggle-active — Admin: soft delete ─
router.patch('/:id/toggle-active', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isActive = !product.isActive;
    await product.save();
    res.json({ success: true, data: product, message: `Product ${product.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/products/:id — Admin: hard delete ───────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted permanently' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
