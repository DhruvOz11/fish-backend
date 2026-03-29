const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderStringId: { type: String, default: '' },
  customer:      { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },
  issueType: {
    type: String,
    enum: ['wrong_item', 'missing_item', 'quality', 'not_delivered', 'late_delivery', 'other'],
    required: true
  },
  description: { type: String, required: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['open', 'in_review', 'resolved', 'closed'],
    default: 'open'
  },
  adminNote:   { type: String, default: '' },
  resolvedAt:  { type: Date, default: null }
}, { timestamps: true });

issueSchema.index({ status: 1 });
issueSchema.index({ customerPhone: 1 });

module.exports = mongoose.model('Issue', issueSchema);
