const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['percentage', 'flat'],
      required: true,
    },
    discount: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = no cap (for flat coupons)
    minOrder: { type: Number, default: 0 }, // minimum cart value
    maxUses: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null }, // null = no expiry
    forNewUsers: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model('Coupon', couponSchema)
