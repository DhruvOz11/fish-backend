const mongoose = require('mongoose')

// Single-document settings store — only one doc ever exists (key: 'global')
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },

    // Delivery
    freeDeliveryThreshold: { type: Number, default: 999 }, // 0 = always charge
    standardDeliveryFee: { type: Number, default: 39 },
    expressDeliveryFee: { type: Number, default: 49 },
    scheduledDeliveryFee: { type: Number, default: 29 },

    // Business
    businessName: { type: String, default: 'FreshCatch' },
    businessWhatsapp: { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    deliverySlots: {
      type: [String],
      default: ['6AM - 8AM', '10AM - 12PM', '2PM - 4PM', '6PM - 8PM'],
    },

    // Store control
    storeOpen: { type: Boolean, default: true },
    storeClosedMessage: {
      type: String,
      default: 'We are closed right now. Back soon!',
    },
    minOrderAmount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
)

// Singleton getter
settingsSchema.statics.getSettings = async function () {
  let s = await this.findOne({ key: 'global' })
  if (!s) s = await this.create({ key: 'global' })
  return s
}

module.exports = mongoose.model('Settings', settingsSchema)
