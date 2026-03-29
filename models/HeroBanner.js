const mongoose = require('mongoose');

const heroBannerSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  subtitle:  { type: String, default: '' },
  badge:     { type: String, default: '' },
  image:     { type: String, required: true },
  linkType:  { type: String, enum: ['category', 'product', 'none'], default: 'category' },
  linkId:    { type: String, default: '' },
  isActive:  { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('HeroBanner', heroBannerSchema);
