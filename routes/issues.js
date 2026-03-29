const express = require('express');
const router  = express.Router();
const Issue   = require('../models/Issue');
const Order   = require('../models/Order');
const adminAuth = require('../middleware/auth');
const { sendWhatsAppMessage } = require('../services/whatsapp');

// POST /api/issues — customer raises an issue
router.post('/', async (req, res) => {
  try {
    const { orderId, issueType, description, customerPhone } = req.body;
    if (!orderId || !issueType || !description)
      return res.status(400).json({ success: false, message: 'orderId, issueType and description required' });

    const order = await Order.findOne({
      $or: [
        { orderId: orderId },
        ...(orderId.match(/^[a-f\d]{24}$/i) ? [{ _id: orderId }] : [])
      ]
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Prevent duplicate open issues on same order
    const existing = await Issue.findOne({ orderId: order._id, status: { $in: ['open','in_review'] } });
    if (existing) return res.status(400).json({ success: false, message: 'An open issue already exists for this order' });

    const issue = await Issue.create({
      orderId:       order._id,
      orderStringId: order.orderId,
      customerName:  order.customerName,
      customerPhone: order.customerPhone,
      issueType, description
    });

    res.status(201).json({ success: true, data: issue, message: 'Issue raised successfully. We will respond shortly.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/issues/mine?phone=91XXXXXXXXXX — customer's own issues
router.get('/mine', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
    const issues = await Issue.find({ customerPhone: { $regex: phone.replace(/[^0-9]/g,''), $options: 'i' } })
      .sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: issues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/issues — admin: all issues
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    const skip = (Number(page)-1) * Number(limit);
    const [issues, total] = await Promise.all([
      Issue.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Issue.countDocuments(filter)
    ]);
    res.json({ success: true, data: issues, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/issues/:id — admin: update status + note
router.patch('/:id', adminAuth, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ success: false, message: 'Issue not found' });

    if (status) issue.status = status;
    if (adminNote !== undefined) issue.adminNote = adminNote;
    if (status === 'resolved') issue.resolvedAt = new Date();
    await issue.save();

    // Notify customer on resolution
    if (status === 'resolved' && issue.customerPhone) {
      const msg = `🐟 *FreshCatch — Issue Resolved*\n\nYour issue for order *${issue.orderStringId}* has been resolved.\n\n${adminNote ? 'Note: ' + adminNote : 'Thank you for your patience!'}`;
      sendWhatsAppMessage(issue.customerPhone, msg).catch(console.error);
    }

    res.json({ success: true, data: issue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
