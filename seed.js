require('dotenv').config()
const mongoose = require('mongoose')
const Product = require('./models/Product')
const Category = require('./models/Category')

const categories = [
  {
    id: 'fish',
    name: 'Fish & Seafood',
    description: 'No added chemicals',
    sortOrder: 1,
    image:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80',
    subcategories: [
      {
        id: 'freshwater',
        name: 'Freshwater',
        image:
          'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=200&q=80',
      },
      {
        id: 'seawater',
        name: 'Seawater',
        image:
          'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=200&q=80',
      },
      {
        id: 'exotic',
        name: 'Exotic Fish',
        image:
          'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
      },
    ],
  },
  {
    id: 'prawns',
    name: 'Prawns & Shrimps',
    description: 'Ocean fresh delicacies',
    sortOrder: 2,
    image:
      'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=800&q=80',
    subcategories: [
      {
        id: 'tiger-prawns',
        name: 'Tiger Prawns',
        image:
          'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=200&q=80',
      },
      {
        id: 'white-prawns',
        name: 'White Prawns',
        image:
          'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=200&q=80',
      },
      {
        id: 'jumbo-shrimps',
        name: 'Jumbo Shrimps',
        image:
          'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
      },
    ],
  },
  {
    id: 'crabs',
    name: 'Crabs & Lobsters',
    description: 'Premium shellfish',
    sortOrder: 3,
    image:
      'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=800&q=80',
    subcategories: [
      {
        id: 'mud-crab',
        name: 'Mud Crabs',
        image:
          'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
      },
      {
        id: 'blue-crab',
        name: 'Blue Crabs',
        image:
          'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
      },
      {
        id: 'lobster',
        name: 'Lobsters',
        image:
          'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80',
      },
    ],
  },
  {
    id: 'squid',
    name: 'Squid & Octopus',
    description: 'Tender & fresh',
    sortOrder: 4,
    image:
      'https://images.unsplash.com/photo-1566740933430-b5e70b06d2d5?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1566740933430-b5e70b06d2d5?w=800&q=80',
    subcategories: [
      {
        id: 'squid-rings',
        name: 'Squid Rings',
        image:
          'https://images.unsplash.com/photo-1566740933430-b5e70b06d2d5?w=200&q=80',
      },
      {
        id: 'baby-octopus',
        name: 'Baby Octopus',
        image:
          'https://images.unsplash.com/photo-1566740933430-b5e70b06d2d5?w=200&q=80',
      },
      {
        id: 'whole-squid',
        name: 'Whole Squid',
        image:
          'https://images.unsplash.com/photo-1566740933430-b5e70b06d2d5?w=200&q=80',
      },
    ],
  },
  {
    id: 'ready-to-cook',
    name: 'Ready to Cook',
    description: 'Freshly marinated',
    sortOrder: 5,
    image:
      'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=800&q=80',
    subcategories: [
      {
        id: 'marinated-fish',
        name: 'Marinated Fish',
        image:
          'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=200&q=80',
      },
      {
        id: 'fish-fry',
        name: 'Fish Fry Ready',
        image:
          'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=200&q=80',
      },
      {
        id: 'curry-cut',
        name: 'Curry Cut',
        image:
          'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=200&q=80',
      },
    ],
  },
  {
    id: 'combos',
    name: 'Seafood Combos',
    description: 'Value packs & bundles',
    sortOrder: 6,
    image:
      'https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=800&q=80',
    subcategories: [
      {
        id: 'family-pack',
        name: 'Family Packs',
        image:
          'https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=200&q=80',
      },
      {
        id: 'party-pack',
        name: 'Party Packs',
        image:
          'https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=200&q=80',
      },
      {
        id: 'starter-combo',
        name: 'Starter Combos',
        image:
          'https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=200&q=80',
      },
    ],
  },
  {
    id: 'dried',
    name: 'Dried Seafood',
    description: 'Traditional favorites',
    sortOrder: 7,
    image:
      'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80',
    subcategories: [
      {
        id: 'dried-fish',
        name: 'Dried Fish',
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80',
      },
      {
        id: 'dried-prawns',
        name: 'Dried Prawns',
        image:
          'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80',
      },
    ],
  },
  {
    id: 'specials',
    name: 'Chef Specials',
    description: 'Gourmet selections',
    sortOrder: 8,
    image:
      'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=200&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800&q=80',
    subcategories: [
      {
        id: 'sashimi',
        name: 'Sashimi Grade',
        image:
          'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=200&q=80',
      },
      {
        id: 'premium-cuts',
        name: 'Premium Cuts',
        image:
          'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=200&q=80',
      },
    ],
  },
]

const products = [
  {
    id: 'p1',
    name: 'Sole fish ( jipta )',
    description: 'Fresh whole fish for rawa fries, curries & more',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1Kg',
    pieces: '4-5 Pieces',
    serves: '3-4',
    price: 230,
    originalPrice: 699,
    discount: 67,
    images: [
      'https://i.ibb.co/JWn0DwM5/jipta-2.png',
      'https://i.ibb.co/TXXwgM6/jipta.png',
      //   'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
    ],
    badge: 'bestseller',
    inStock: true,
    stockQty: 25,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'No added chemicals',
      'Cleaned & ready to cook',
      'Lab tested for quality',
      'Sourced from trusted fishermen',
    ],
  },
  {
    id: 'p2',
    name: 'Pink perch ( Rani )',
    description: 'Premium quality fish',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '4-5 Pieces approx',
    serves: '3-4',
    price: 200,
    originalPrice: 300,
    discount: 33,
    images: ['https://i.ibb.co/h1V7r1Dq/Pink-perch-Rani.png'],
    badge: '',
    inStock: true,
    stockQty: 40,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Freshwater fish',
      'Traditional Bengali cut',
      'Perfect for fish curry',
      'High in protein',
    ],
  },
  {
    id: 'p3',
    name: 'White kaskaa',
    description: 'Premium quality fish',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '4-5 approx',
    serves: '2-3',
    price: 180,
    originalPrice: 360,
    discount: 50,
    images: ['https://i.ibb.co/Q3C2GSG3/White-kaskaa.png'],
    badge: 'premium',
    inStock: true,
    stockQty: 15,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'King of fish',
      'Perfect steaks',
      'Great for grilling',
      'Rich in Omega-3',
    ],
  },
  {
    id: 'p4',
    name: 'Kati Fish',
    description: 'high grade quality',
    category: 'fish',
    subcategory: 'exotic',
    weight: '1kg',
    pieces: '4-5 approx',
    serves: '3-4',
    price: 250,
    originalPrice: 500,
    discount: 50,
    images: ['https://i.ibb.co/7dcTybtc/katifish.jpg'],
    badge: 'new',
    inStock: true,
    stockQty: 8,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Norwegian salmon',
      'Sashimi grade',
      'Rich in Omega-3',
      'Premium quality',
    ],
  },
  {
    id: 'p5',
    name: 'Black Pomfret ( black halvoo )',
    description: 'Premium quality fish',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '5-6 approx',
    serves: '4-5',
    price: 500,
    originalPrice: 1000,
    discount: 50,
    images: ['https://i.ibb.co/cKp16Yg7/blkpaplet.jpg'],
    badge: 'bestseller',
    inStock: true,
    stockQty: 50,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: ['Ready to cook', 'Great taste', 'Great for kids'],
  },
  {
    id: 'p6',
    name: 'Bombay bangra ( aaila bangra )',
    description: 'Fresh Bangra, perfect for authentic fish curry',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '6-7 approx',
    serves: '4-5 approx',
    price: 180,
    originalPrice: 360,
    discount: 50,
    images: ['https://i.ibb.co/YBM5pfQd/bangra.jpg'],
    badge: '',
    inStock: false,
    stockQty: 0,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Freshwater delicacy',
      'Rich taste',
      'Perfect for curry',
      'High protein',
    ],
  },
  // Prawns Products
  {
    id: 'p7',
    name: 'Silver pomfret ( paplet )',
    description: 'Fresh quality',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '6-7 Pieces',
    serves: '4-5 approx',
    price: 350,
    originalPrice: 700,
    discount: 50,
    images: [
      'https://i.ibb.co/DPsFQFKv/silverpaplet.jpg',
      'https://i.ibb.co/0pk4NjZm/silverpaplet2.jpg',
    ],
    badge: 'bestseller',
    inStock: true,
    stockQty: 30,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Large size',
      'Cleaned & deveined',
      'Juicy & sweet',
      'Perfect for grilling',
    ],
  },
  {
    id: 'p8',
    name: 'prawns 🦐',
    description: 'Sweet freshwater prawns, cleaned & deveined',
    category: 'prawns',
    subcategory: 'white-prawns',
    weight: '1kg',
    pieces: '20-30 Pieces',
    serves: '3-4 approx',
    price: 449,
    originalPrice: 898,
    discount: 50,
    images: [
      'https://i.ibb.co/sJbRXPLX/prawn1.jpg',
      'https://i.ibb.co/r2dZ46kR/prawn2.jpg',
      'https://i.ibb.co/Q3z36H7s/prawn3.jpg',
    ],
    badge: 'bestseller',
    inStock: true,
    stockQty: 45,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Sea-water variety',
      'fresh taste',
      'Medium size',
      'Versatile cooking',
    ],
  },
  {
    id: 'p9',
    name: 'Tickrokerr fish small size',
    description: 'Premium quality',
    category: 'fish',
    subcategory: 'seawater',
    weight: '1kg',
    pieces: '10-12 approx',
    serves: '3-4 approx',
    price: 200,
    originalPrice: 300,
    discount: 33,
    images: ['https://i.ibb.co/3VnpzSn/Tickrokerr.jpg'],
    badge: 'premium',
    inStock: true,
    stockQty: 12,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: ['Party special', 'Impressive presentation', 'Succulent taste'],
  },
  // Crabs Products
  {
    id: 'p10',
    name: 'Fresh rohu ( લાલિયો રવ )',
    description: 'Fresh supreme quality',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '500g',
    pieces: '1 Piece',
    serves: '2',
    price: 799,
    originalPrice: 899,
    discount: 11,
    images: [
      'https://i.ibb.co/vxRKSNrS/rohu.jpg',
      'https://i.ibb.co/p6f60vLx/rohu2.jpg',
    ],
    badge: 'premium',
    inStock: true,
    stockQty: 10,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Live & fresh',
      'Sweet crab meat',
      'Full of roe',
      'Restaurant quality',
    ],
  },
  {
    id: 'p11',
    name: 'Pangasius fresh fish ( Basa fish , pangas fish )',
    description: 'Tender blue crab, perfect for crab curry',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '6-7 Pieces',
    serves: '3-4 approx',
    price: 130,
    originalPrice: 260,
    discount: 50,
    images: ['https://i.ibb.co/SDrj5sNm/Pangasius.jpg'],
    badge: '',
    inStock: true,
    stockQty: 20,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Tender meat',
      'Great for curry',
      'Sweet flavor',
      'Easy to cook',
    ],
  },
  // Squid Products
  {
    id: 'p12',
    name: 'Fresh roopchand ( Chinese halwa ) lal pari',
    description: 'best quality',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '6-7 approx',
    serves: '3-4',
    price: 140,
    originalPrice: 280,
    discount: 50,
    images: [
      'https://i.ibb.co/SDSM1rh9/roopchand.jpg',
      'https://i.ibb.co/3YNPVCw7/roopchand2.jpg',
    ],
    badge: '',
    inStock: true,
    stockQty: 35,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: ['Tender texture', 'Quick cooking', 'Great for calamari'],
  },
  {
    id: 'p13',
    name: 'Fresh Catla rohu ( bhakuda )',
    description: 'A1 Grade quality, fresh-water fish',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '6-8 Pieces',
    serves: '3-4 approx',
    price: 130,
    originalPrice: 260,
    discount: 50,
    images: ['https://i.ibb.co/1tw9YK60/cutla.jpg'],
    badge: 'new',
    inStock: true,
    stockQty: 15,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: ['Tender & delicious', 'Restaurant favorite', 'Easy to cook'],
  },
  // Ready to Cook
  {
    id: 'p14',
    name: 'Kolkata bhetki ( sea fish )',
    description: 'fresh water fish',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '4-5 approx',
    serves: '3-4 approx',
    price: 150,
    originalPrice: 300,
    discount: 50,
    images: [
      'https://i.ibb.co/xt7CQLck/kolkata.jpg',
      'https://i.ibb.co/B5s8Q0vT/kalkata.jpg',
    ],
    badge: 'bestseller',
    inStock: false,
    stockQty: 25,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: ['Just fry & serve', 'Authentic taste'],
  },
  {
    id: 'p15',
    name: 'Fresh Catla rohu ( bhakuda )',
    description: 'fresh water fish',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '5-6 Pieces',
    serves: '3-4 approx',
    price: 130,
    originalPrice: 260,
    discount: 50,
    images: [
      'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&q=80',
    ],
    badge: '',
    inStock: true,
    stockQty: 30,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Tandoori marinated',
      'Grill or bake',
      'Restaurant style',
      'Juicy & flavorful',
    ],
  },
  {
    id: 'p16',
    name: 'Fresh Mirgall rohu ( મિર્ગલ રોહુ )',
    description: 'freshwater fish',
    category: 'fish',
    subcategory: 'freshwater',
    weight: '1kg',
    pieces: '4-5 approx',
    serves: '3-4 approx',
    price: 100,
    originalPrice: 200,
    discount: 50,
    images: ['https://i.ibb.co/jPJLhw1B/Mirgall.jpg'],
    badge: '',
    inStock: true,
    stockQty: 20,
    deliveryTime: 'Tomorrow 6AM - 8AM',
    highlights: [
      'Perfect curry cut',
      'Fresh surmai',
      'Bone-in for flavor',
      'Ready to cook',
    ],
  },
]

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Connected to MongoDB Atlas')

    // Clear existing
    await Product.deleteMany({})
    await Category.deleteMany({})
    console.log('🗑  Cleared existing data')

    // Insert categories
    await Category.insertMany(categories)
    console.log(`✅ Seeded ${categories.length} categories`)

    // Insert products
    await Product.insertMany(products)
    console.log(`✅ Seeded ${products.length} products`)

    console.log('\n🎉 Database seeded successfully!')
    console.log('You can now run: npm run dev')
    process.exit(0)
  } catch (err) {
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  }
}

seed()
