const mongoose = require('mongoose')

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home' },
    address: { type: String, required: true },
    landmark: { type: String, default: '' },
    pincode: { type: String, required: true },
    city: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
)

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, unique: true, trim: true },
    addresses: { type: [addressSchema], default: [] },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model('Customer', customerSchema)
