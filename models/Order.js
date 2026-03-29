const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:      { type: String, required: true },
  price:     { type: Number, required: true },
  quantity:  { type: Number, required: true, min: 1 },
  weight:    { type: String, default: '' },
  image:     { type: String, default: '' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    default: () => 'ORD' + Date.now().toString().slice(-8)
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  customerName:  { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true },
  address:       { type: String, required: true },
  landmark:      { type: String, default: '' },
  pincode:       { type: String, required: true },
  city:          { type: String, default: '' },

  items:         { type: [orderItemSchema], required: true },
  itemTotal:     { type: Number, required: true },
  deliveryFee:   { type: Number, default: 0 },
  discount:      { type: Number, default: 0 },
  couponCode:    { type: String, default: '' },
  totalAmount:   { type: Number, required: true },

  deliveryType:  { type: String, enum: ['standard', 'express', 'scheduled'], default: 'standard' },
  deliverySlot:  { type: String, default: 'Tomorrow 6AM - 8AM' },
  paymentMethod: { type: String, enum: ['COD', 'Online'], default: 'COD' },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending'
  },
  statusHistory: [{
    status:    { type: String },
    note:      { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
  }],

  whatsappSent:  { type: Boolean, default: false },
  notes:         { type: String, default: '' },
  cancelReason:  { type: String, default: '' }
}, {
  timestamps: true
});

// Index for analytics queries
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ customerPhone: 1 });

module.exports = mongoose.model('Order', orderSchema);
