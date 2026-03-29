const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['fish', 'prawns', 'crabs', 'squid', 'ready-to-cook', 'combos', 'dried', 'specials']
  },
  subcategory: {
    type: String,
    trim: true,
    default: ''
  },
  weight: {
    type: String,
    required: [true, 'Weight is required'],
    trim: true
  },
  pieces: {
    type: String,
    trim: true,
    default: ''
  },
  serves: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    required: [true, 'Original price is required'],
    min: [0, 'Original price cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  badge: {
    type: String,
    enum: ['bestseller', 'new', 'premium', ''],
    default: ''
  },
  images: {
    type: [String],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 5,
      message: 'Maximum 5 images allowed'
    }
  },
  highlights: {
    type: [String],
    default: []
  },
  inStock: {
    type: Boolean,
    default: true
  },
  stockQty: {
    type: Number,
    default: 0,
    min: 0
  },
  deliveryTime: {
    type: String,
    default: 'Tomorrow 6AM - 8AM'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Auto-calc discount before save
productSchema.pre('save', function (next) {
  if (this.originalPrice && this.price && this.originalPrice > this.price) {
    this.discount = Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  } else {
    this.discount = 0;
  }
  next();
});

// Auto-set inStock based on stockQty
productSchema.pre('save', function (next) {
  if (this.stockQty <= 0) this.inStock = false;
  next();
});

module.exports = mongoose.model('Product', productSchema);
