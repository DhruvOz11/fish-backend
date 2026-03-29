// =====================================================
// FRESHCATCH - SEAFOOD QUICK COMMERCE APPLICATION
// =====================================================

// ─── CONFIG ──────────────────────────────────────────────────────
const WHATSAPP_NUMBER = '919054217787' // Change to your number
const API_BASE = '/api' // Backend URL (same origin when deployed)

// ─── Admin Auth State ────────────────────────────────────────────
let adminToken = localStorage.getItem('fc_admin_token') || null

// ─── API Helper ──────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'API error')
  return data
}

// =====================================================
// GPS / REAL-TIME LOCATION
// =====================================================

function requestGPSLocation(onSuccess) {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error')
    return
  }
  showToast('Fetching your location...', 'success')
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords
      try {
        // Free reverse-geocode via OpenStreetMap Nominatim
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        )
        const data = await res.json()
        const a = data.address || {}

        // Build a human-readable address from the parts that exist
        const parts = [
          a.house_number,
          a.road || a.pedestrian || a.footway,
          a.neighbourhood || a.suburb,
          a.city || a.town || a.village || a.county,
          a.state,
        ].filter(Boolean)

        const address = parts.join(', ')
        const pincode = a.postcode || ''
        const city = a.city || a.town || a.village || a.county || 'India'

        // Save to app state so cart footer updates too
        window.appData.deliveryLocation = {
          address,
          pincode,
          city,
          latitude,
          longitude,
        }
        const display = city + (pincode ? `, ${pincode}` : '')
        const headerEl = document.getElementById('delivery-address')
        if (headerEl) headerEl.textContent = display

        showToast('Location detected!', 'success')
        if (typeof onSuccess === 'function') onSuccess({ address, pincode })
      } catch (e) {
        showToast('Could not read address. Please enter manually.', 'error')
      }
    },
    (err) => {
      const msgs = {
        1: 'Location permission denied. Please allow access in your browser settings.',
        2: 'Location unavailable. Please enter address manually.',
        3: 'Location request timed out. Please try again.',
      }
      showToast(
        msgs[err.code] || 'Location error. Please enter manually.',
        'error',
      )
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  )
}

// State Management
let state = {
  currentPage: 'home',
  previousPages: [],
  selectedCategory: null,
  selectedProduct: null,
  cart: { items: [], couponCode: null, couponDiscount: 0 },
  deliveryOption: 'standard',
  heroSlideIndex: 0,
  searchQuery: '',
  adminLoggedIn: !!adminToken,
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initApp()
})

async function initApp() {
  state.cart = window.appData.cart

  // Render with local data immediately (instant load)
  renderHomeCategories()
  renderCurrentHits()
  renderFishProducts()
  renderPrawnsProducts()
  renderReadyToCookProducts()
  renderAllCategories()
  initHeroSlider()
  updateCartUI()

  const dateEl = document.getElementById('admin-date')
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) showPage(e.state.page, false)
  })
  history.pushState({ page: 'home' }, '', '#home')

  // Silently fetch live data from backend in background
  loadLiveData()

  // Auto-request GPS location silently
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } },
          )
          const data = await res.json()
          const a = data.address || {}
          const city = a.city || a.town || a.village || a.county || ''
          const pincode = a.postcode || ''
          const parts = [a.neighbourhood || a.suburb, city, pincode].filter(
            Boolean,
          )
          const display = parts.join(', ')
          window.appData.deliveryLocation = {
            address: display,
            pincode,
            city,
            fromGPS: true,
          }
          const el = document.getElementById('delivery-address')
          if (el && display) el.textContent = display
        } catch (e) {}
      },
      () => {}, // silent fail
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }
}

async function loadLiveData() {
  try {
    const [prodRes, catRes] = await Promise.all([
      api('/products'),
      api('/categories'),
    ])
    if (prodRes.success && prodRes.data.length) {
      // Map _id to id for compatibility with existing render functions
      window.appData.products = prodRes.data.map((p) => ({ ...p, id: p._id }))
    }
    if (catRes.success && catRes.data.length) {
      window.appData.categories = catRes.data
    }
    // Re-render all sections with live data
    renderHomeCategories()
    renderCurrentHits()
    renderFishProducts()
    renderPrawnsProducts()
    renderReadyToCookProducts()
    renderAllCategories()
  } catch (e) {
    // Backend not connected — silently use local data.js data
    console.warn('Backend offline, using local data:', e.message)
  }
}

// =====================================================
// NAVIGATION
// =====================================================

function navigateTo(page, data = null) {
  state.previousPages.push(state.currentPage)
  showPage(page, true, data)
}

// Pages where the floating cart button must be hidden
const HIDE_CART_BTN_PAGES = ['cart', 'checkout']

function showPage(page, pushState = true, data = null) {
  // Hide all pages
  document
    .querySelectorAll('.page')
    .forEach((p) => p.classList.remove('active'))

  // Show selected page
  const pageEl = document.getElementById(`${page}-page`)
  if (pageEl) {
    pageEl.classList.add('active')
  }

  // Update nav
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === page)
  })

  // Update state
  state.currentPage = page

  // Push to history
  if (pushState) {
    history.pushState({ page }, '', `#${page}`)
  }

  // Page-specific initialization
  if (page === 'search') {
    setTimeout(() => {
      document.getElementById('search-input')?.focus()
    }, 100)
  }

  // Hide floating cart on cart & checkout so it never covers action buttons
  const floatingCart = document.getElementById('floating-cart')
  if (floatingCart) {
    const totalItems = state.cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    )
    const shouldShow = totalItems > 0 && !HIDE_CART_BTN_PAGES.includes(page)
    floatingCart.style.display = shouldShow ? 'flex' : 'none'
  }

  // Scroll to top
  window.scrollTo(0, 0)
}

function goBack() {
  if (state.previousPages.length > 0) {
    const prevPage = state.previousPages.pop()
    showPage(prevPage, true)
  } else {
    navigateTo('home')
  }
}

// =====================================================
// HERO SLIDER
// =====================================================

function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide')
  const dots = document.querySelectorAll('.hero-dots .dot')

  if (slides.length === 0) return

  // Auto slide
  setInterval(() => {
    state.heroSlideIndex = (state.heroSlideIndex + 1) % slides.length
    updateHeroSlide()
  }, 5000)

  // Dot click handlers
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      state.heroSlideIndex = index
      updateHeroSlide()
    })
  })

  // Slide click handlers
  slides.forEach((slide) => {
    slide.addEventListener('click', () => {
      const linkType = slide.dataset.link
      const linkId = slide.dataset.id
      if (linkType === 'category') {
        openCategory(linkId)
      } else if (linkType === 'product') {
        openProduct(linkId)
      }
    })
  })
}

function updateHeroSlide() {
  const slides = document.querySelectorAll('.hero-slide')
  const dots = document.querySelectorAll('.hero-dots .dot')

  slides.forEach((slide, index) => {
    slide.classList.toggle('active', index === state.heroSlideIndex)
  })

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === state.heroSlideIndex)
  })
}

// =====================================================
// RENDER FUNCTIONS
// =====================================================

function renderHomeCategories() {
  const container = document.getElementById('home-categories')
  if (!container) return

  const topCategories = window.appData.categories.slice(0, 5)

  container.innerHTML =
    topCategories
      .map(
        (cat) => `
        <div class="category-card" onclick="openCategory('${cat.id}')">
            <img src="${cat.image}" alt="${cat.name}" class="category-image">
            <span class="category-name">${cat.name}</span>
        </div>
    `,
      )
      .join('') +
    `
        <div class="category-card" onclick="navigateTo('categories')">
            <div class="category-image" style="background: var(--primary-light); display: flex; align-items: center; justify-content: center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="width: 28px; height: 28px;">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/>
                </svg>
            </div>
            <span class="category-name">See All</span>
        </div>
    `
}

function renderProductCard(product) {
  const cartItem = state.cart.items.find((item) => item.id === product.id)
  const quantity = cartItem ? cartItem.quantity : 0

  const badgeClass =
    product.badge === 'bestseller'
      ? 'bestseller'
      : product.badge === 'new'
        ? 'new'
        : ''
  const stockClass = !product.inStock ? 'out-of-stock' : ''

  return `
        <div class="product-card ${stockClass}" data-id="${product.id}">
            <div class="product-image-wrapper" onclick="openProduct('${product.id}')">
                <img src="${product.images[0]}" alt="${product.name}" class="product-image">
                ${product.badge ? `<span class="product-badge ${badgeClass}">${product.badge}</span>` : ''}
            </div>
            <div class="product-info">
                <h4 class="product-name" onclick="openProduct('${product.id}')">${product.name}</h4>
                <p class="product-weight">${product.weight} | ${product.pieces} | Serves ${product.serves}</p>
                <div class="product-price-row">
                    <div class="product-price">
                        <span class="current-price">₹${product.price}</span>
                        ${
                          product.originalPrice > product.price
                            ? `
                            <span class="original-price">₹${product.originalPrice}</span>
                            <span class="discount-badge">${product.discount}% off</span>
                        `
                            : ''
                        }
                    </div>
                    ${
                      product.inStock
                        ? quantity > 0
                          ? `
                        <div class="quantity-control">
                            <button class="qty-btn" onclick="event.stopPropagation(); updateCart('${product.id}', ${quantity - 1})">−</button>
                            <span class="qty-value">${quantity}</span>
                            <button class="qty-btn" onclick="event.stopPropagation(); updateCart('${product.id}', ${quantity + 1})">+</button>
                        </div>
                    `
                          : `
                        <button class="add-btn" onclick="event.stopPropagation(); addToCart('${product.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add
                        </button>
                    `
                        : ''
                    }
                </div>
            </div>
        </div>
    `
}

function renderCurrentHits() {
  const container = document.getElementById('current-hits')
  if (!container) return

  const hits = window.appData.products
    .filter((p) => p.badge === 'bestseller' || p.badge === 'new')
    .slice(0, 6)
  container.innerHTML = hits.map(renderProductCard).join('')
}

function renderFishProducts() {
  const container = document.getElementById('fish-products')
  if (!container) return

  const fishProducts = window.appData.products
    .filter((p) => p.category === 'fish')
    .slice(0, 6)
  container.innerHTML = fishProducts.map(renderProductCard).join('')
}

function renderPrawnsProducts() {
  const container = document.getElementById('prawns-products')
  if (!container) return

  const prawnsProducts = window.appData.products
    .filter((p) => p.category === 'prawns' || p.category === 'crabs')
    .slice(0, 6)
  container.innerHTML = prawnsProducts.map(renderProductCard).join('')
}

function renderReadyToCookProducts() {
  const container = document.getElementById('ready-to-cook-products')
  if (!container) return

  const rtcProducts = window.appData.products
    .filter((p) => p.category === 'ready-to-cook' || p.category === 'combos')
    .slice(0, 6)
  container.innerHTML = rtcProducts.map(renderProductCard).join('')
}

function renderAllCategories() {
  const container = document.getElementById('all-categories')
  if (!container) return

  container.innerHTML = window.appData.categories
    .map(
      (cat) => `
        <div class="category-item" data-id="${cat.id}">
            <div class="category-header" onclick="toggleCategory('${cat.id}')">
                <img src="${cat.image}" alt="${cat.name}" class="category-icon">
                <div class="category-info">
                    <h4>${cat.name}</h4>
                    <p>${cat.description}</p>
                </div>
                <div class="category-expand">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </div>
            <div class="subcategories">
                <div class="subcategory-grid">
                    ${cat.subcategories
                      .map(
                        (sub) => `
                        <div class="subcategory-card" onclick="openSubcategory('${cat.id}', '${sub.id}')">
                            <img src="${sub.image}" alt="${sub.name}" class="subcategory-image">
                            <span class="subcategory-name">${sub.name}</span>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
        </div>
    `,
    )
    .join('')
}

function toggleCategory(catId) {
  const item = document.querySelector(`.category-item[data-id="${catId}"]`)
  if (item) {
    const wasExpanded = item.classList.contains('expanded')
    // Close all
    document
      .querySelectorAll('.category-item')
      .forEach((el) => el.classList.remove('expanded'))
    // Toggle this one
    if (!wasExpanded) {
      item.classList.add('expanded')
    }
  }
}

function openCategory(catId) {
  const category = window.appData.categories.find((c) => c.id === catId)
  if (!category) return

  state.selectedCategory = category

  // Update hero
  document.getElementById('category-hero-image').src = category.heroImage
  document.getElementById('category-hero-image').alt = category.name
  document.getElementById('category-title').textContent = category.name
  document.getElementById('category-subtitle').textContent =
    category.description

  // Get products
  const categoryProducts = window.appData.products.filter(
    (p) => p.category === catId,
  )

  // Update count
  document.getElementById('products-count').textContent =
    `${categoryProducts.length} items available`

  // Render products
  const container = document.getElementById('category-products')
  container.innerHTML = categoryProducts.map(renderProductCard).join('')

  navigateTo('products')
}

function openSubcategory(catId, subId) {
  const category = window.appData.categories.find((c) => c.id === catId)
  const subcategory = category?.subcategories.find((s) => s.id === subId)
  if (!category || !subcategory) return

  state.selectedCategory = { ...category, currentSubcategory: subcategory }

  // Update hero
  document.getElementById('category-hero-image').src = subcategory.image
  document.getElementById('category-hero-image').alt = subcategory.name
  document.getElementById('category-title').textContent = subcategory.name
  document.getElementById('category-subtitle').textContent =
    `${category.name} - Fresh & delicious`

  // Get products
  const subProducts = window.appData.products.filter(
    (p) => p.category === catId && p.subcategory === subId,
  )

  // Update count
  document.getElementById('products-count').textContent =
    `${subProducts.length} items available`

  // Render products
  const container = document.getElementById('category-products')
  container.innerHTML =
    subProducts.length > 0
      ? subProducts.map(renderProductCard).join('')
      : `<div class="cart-empty" style="grid-column: 1/-1;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
            </svg>
            <h3>No products found</h3>
            <p>Check back soon for new arrivals!</p>
        </div>`

  navigateTo('products')
}

function openProduct(productId) {
  const product = window.appData.products.find((p) => p.id === productId)
  if (!product) return

  state.selectedProduct = product
  const cartItem = state.cart.items.find((item) => item.id === product.id)
  const quantity = cartItem ? cartItem.quantity : 0

  const container = document.getElementById('product-detail')
  container.innerHTML = `
        <div class="product-detail-images">
            <img src="${product.images[0]}" alt="${product.name}" class="product-detail-image" id="main-product-image">
            ${
              product.images.length > 1
                ? `
                <div class="image-dots">
                    ${product.images
                      .map(
                        (_, i) => `
                        <span class="dot ${i === 0 ? 'active' : ''}" onclick="changeProductImage(${i})"></span>
                    `,
                      )
                      .join('')}
                </div>
            `
                : ''
            }
        </div>
        <div class="product-detail-info">
            ${product.badge ? `<span class="product-badge ${product.badge === 'bestseller' ? 'bestseller' : product.badge === 'new' ? 'new' : ''}" style="position: static; margin-bottom: 12px;">${product.badge.toUpperCase()}</span>` : ''}
            <h1 class="product-detail-name">${product.name}</h1>
            <p class="product-detail-desc">${product.description}</p>
            
            <div class="product-detail-meta">
                <div class="meta-item">
                    <span class="meta-label">Weight</span>
                    <span class="meta-value">${product.weight}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Pieces</span>
                    <span class="meta-value">${product.pieces}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Serves</span>
                    <span class="meta-value">${product.serves}</span>
                </div>
            </div>
            
            <div class="product-detail-price">
                <span class="detail-current-price">₹${product.price}</span>
                ${
                  product.originalPrice > product.price
                    ? `
                    <span class="detail-original-price">₹${product.originalPrice}</span>
                    <span class="detail-discount">${product.discount}% off</span>
                `
                    : ''
                }
            </div>
            
            <div class="delivery-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                </svg>
                <span>${product.deliveryTime}</span>
            </div>
            
            <div class="product-highlights">
                <h4>Why you'll love it</h4>
                <div class="highlight-list">
                    ${product.highlights
                      .map(
                        (h) => `
                        <div class="highlight-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 6L9 17l-5-5"/>
                            </svg>
                            <span>${h}</span>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
        </div>
        
        <div class="product-detail-actions" id="product-actions">
            ${
              product.inStock
                ? quantity > 0
                  ? `
                <div class="detail-qty-control">
                    <button class="detail-qty-btn" onclick="updateCart('${product.id}', ${quantity - 1}); renderProductActions();">−</button>
                    <span class="detail-qty-value">${quantity}</span>
                    <button class="detail-qty-btn" onclick="updateCart('${product.id}', ${quantity + 1}); renderProductActions();">+</button>
                </div>
                <button class="detail-add-btn" onclick="navigateTo('cart')">
                    View Cart - ₹${state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)}
                </button>
            `
                  : `
                <button class="detail-add-btn" onclick="addToCart('${product.id}'); renderProductActions();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                        <circle cx="9" cy="21" r="1"/>
                        <circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
                    </svg>
                    Add to Cart - ₹${product.price}
                </button>
            `
                : `
                <button class="detail-add-btn" style="background: var(--text-muted); cursor: not-allowed;">
                    Out of Stock
                </button>
            `
            }
        </div>
    `

  navigateTo('product-detail')
}

function renderProductActions() {
  const product = state.selectedProduct
  if (!product) return

  const cartItem = state.cart.items.find((item) => item.id === product.id)
  const quantity = cartItem ? cartItem.quantity : 0

  const container = document.getElementById('product-actions')
  if (!container) return

  container.innerHTML = product.inStock
    ? quantity > 0
      ? `
        <div class="detail-qty-control">
            <button class="detail-qty-btn" onclick="updateCart('${product.id}', ${quantity - 1}); renderProductActions();">−</button>
            <span class="detail-qty-value">${quantity}</span>
            <button class="detail-qty-btn" onclick="updateCart('${product.id}', ${quantity + 1}); renderProductActions();">+</button>
        </div>
        <button class="detail-add-btn" onclick="navigateTo('cart')">
            View Cart - ₹${state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)}
        </button>
    `
      : `
        <button class="detail-add-btn" onclick="addToCart('${product.id}'); renderProductActions();">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
            </svg>
            Add to Cart - ₹${product.price}
        </button>
    `
    : `
        <button class="detail-add-btn" style="background: var(--text-muted); cursor: not-allowed;">
            Out of Stock
        </button>
    `
}

function changeProductImage(index) {
  const product = state.selectedProduct
  if (!product || !product.images[index]) return

  document.getElementById('main-product-image').src = product.images[index]
  document.querySelectorAll('.product-detail-images .dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index)
  })
}

// =====================================================
// CART FUNCTIONS
// =====================================================

function addToCart(productId) {
  const product = window.appData.products.find((p) => p.id === productId)
  if (!product || !product.inStock) return

  const existingItem = state.cart.items.find((item) => item.id === productId)
  if (existingItem) {
    existingItem.quantity += 1
  } else {
    state.cart.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      weight: product.weight,
      image: product.images[0],
      quantity: 1,
    })
  }

  updateCartUI()
  showToast(`${product.name} added to cart`, 'success')
  refreshProductCards()
}

function updateCart(productId, quantity) {
  if (quantity <= 0) {
    state.cart.items = state.cart.items.filter((item) => item.id !== productId)
  } else {
    const item = state.cart.items.find((item) => item.id === productId)
    if (item) {
      item.quantity = quantity
    }
  }

  updateCartUI()
  refreshProductCards()
}

function refreshProductCards() {
  // Refresh all product displays
  renderCurrentHits()
  renderFishProducts()
  renderPrawnsProducts()
  renderReadyToCookProducts()

  // Refresh category products if on products page
  if (state.currentPage === 'products' && state.selectedCategory) {
    const catId = state.selectedCategory.id
    const subId = state.selectedCategory.currentSubcategory?.id
    const products = subId
      ? window.appData.products.filter(
          (p) => p.category === catId && p.subcategory === subId,
        )
      : window.appData.products.filter((p) => p.category === catId)
    document.getElementById('category-products').innerHTML = products
      .map(renderProductCard)
      .join('')
  }

  // Refresh search results
  if (state.currentPage === 'search' && state.searchQuery) {
    handleSearch(state.searchQuery)
  }
}

function updateCartUI() {
  const totalItems = state.cart.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )
  const totalPrice = state.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  // Update floating cart — hide on cart/checkout pages so it never blocks action buttons
  const floatingCart = document.getElementById('floating-cart')
  if (floatingCart) {
    const onBlockedPage = HIDE_CART_BTN_PAGES.includes(state.currentPage)
    floatingCart.style.display =
      totalItems > 0 && !onBlockedPage ? 'flex' : 'none'
  }

  document.getElementById('cart-badge').textContent = totalItems
  document.getElementById('cart-items-count').textContent =
    `${totalItems} item${totalItems !== 1 ? 's' : ''}`
  document.getElementById('cart-total').textContent = `₹${totalPrice}`

  // Render cart page content
  renderCartPage()
}

function renderCartPage() {
  const container = document.getElementById('cart-content')
  if (!container) return

  if (state.cart.items.length === 0) {
    container.innerHTML = `
            <div class="cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="21" r="1"/>
                    <circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
                </svg>
                <h3>Your cart is empty</h3>
                <p>Looks like you haven't added anything to your cart yet.</p>
                <button class="btn btn-primary" onclick="navigateTo('home')" style="max-width: 200px;">
                    Start Shopping
                </button>
            </div>
        `
    return
  }

  const itemTotal = state.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const originalTotal = state.cart.items.reduce(
    (sum, item) => sum + item.originalPrice * item.quantity,
    0,
  )
  const deliveryOption = window.appData.deliveryOptions.find(
    (o) => o.id === state.deliveryOption,
  )
  const deliveryFee = deliveryOption?.fee || 39
  const savings = originalTotal - itemTotal + state.cart.couponDiscount
  const totalAmount = itemTotal + deliveryFee - state.cart.couponDiscount

  container.innerHTML = `
        <div class="cart-delivery-slot">
            <div class="slot-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                </svg>
                <span><strong>Tomorrow</strong> by 6 AM - 8 AM</span>
            </div>
            <button class="change-slot-btn">
                Change Slot
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
        </div>
        
        <div class="cart-items">
            ${state.cart.items
              .map(
                (item) => `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-info">
                        <h4 class="cart-item-name">${item.name}</h4>
                        <p class="cart-item-weight">${item.weight}</p>
                        <div class="cart-item-price-row">
                            <div class="cart-item-price">
                                <span class="cart-item-current">₹${item.price * item.quantity}</span>
                                ${item.originalPrice > item.price ? `<span class="cart-item-original">₹${item.originalPrice * item.quantity}</span>` : ''}
                            </div>
                            <div class="cart-qty-control">
                                <button class="cart-qty-btn" onclick="updateCart('${item.id}', ${item.quantity - 1})">−</button>
                                <span class="cart-qty-value">${item.quantity}</span>
                                <button class="cart-qty-btn" onclick="updateCart('${item.id}', ${item.quantity + 1})">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            `,
              )
              .join('')}
        </div>
        
        <div class="cart-offers">
            <h4>Offers & Benefits</h4>
            <button class="apply-coupon-btn" onclick="openCouponModal()">
                <div class="left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    <span>${state.cart.couponCode ? `Code ${state.cart.couponCode} applied` : 'Apply Coupon'}</span>
                </div>
                <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>
            <div class="wallet-option">
                <div class="left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="1" y="4" width="22" height="16" rx="2"/>
                        <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    <span>FreshCatch Wallet Balance: <strong>₹${window.appData.currentUser.walletBalance || 0}</strong></span>
                </div>
                <div class="toggle-switch" onclick="this.classList.toggle('active')"></div>
            </div>
        </div>
        
        <div class="bill-summary">
            <h4>Bill summary</h4>
            <div class="bill-row">
                <span class="label">Item total</span>
                <span class="value">₹${itemTotal}</span>
            </div>
            <div class="bill-row">
                <span class="label">Delivery Fee</span>
                <span class="value">${deliveryFee === 0 ? '<span style="color:var(--accent)">Free</span>' : '₹' + deliveryFee}</span>
            </div>
            ${
              state.cart.couponDiscount > 0
                ? `
                <div class="bill-row">
                    <span class="label">Coupon (${state.cart.couponCode})</span>
                    <span class="value savings">- ₹${state.cart.couponDiscount}</span>
                </div>
            `
                : ''
            }
            ${
              savings > 0
                ? `
                <div class="bill-row">
                    <span class="label">You save</span>
                    <span class="value savings">- ₹${savings}</span>
                </div>
            `
                : ''
            }
            <div class="bill-total">
                <span class="label">Amount to be paid</span>
                <span class="value">₹${totalAmount}</span>
            </div>
        </div>
        
        <div class="cart-policies">
            <h4>Policies</h4>
            <ul>
                <li>Item or quantity modification is not allowed post placing an order. Verify item details before you proceed.</li>
                <li>Order cancellation shall be allowed only until items are dispatched.</li>
                <li>Refunds for cancelled orders will be processed within 3-5 business days.</li>
            </ul>
        </div>
        
        <div class="cart-footer">
            <div class="cart-address">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>${window.appData.deliveryLocation.address}</span>
            </div>
            <button class="checkout-btn" onclick="proceedToCheckout()">
                Proceed to Checkout - ₹${totalAmount}
            </button>
        </div>
    `
}

function proceedToCheckout() {
  renderCheckoutPage()
  navigateTo('checkout')
}

function renderCheckoutPage() {
  const container = document.getElementById('checkout-content')
  if (!container) return

  const itemTotal = state.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const deliveryOption = window.appData.deliveryOptions.find(
    (o) => o.id === state.deliveryOption,
  )
  const deliveryFee = deliveryOption?.fee || 39
  const totalAmount = itemTotal + deliveryFee - state.cart.couponDiscount

  // Pre-fill address only if it came from GPS (not the default "Mumbai, 400001")
  const savedAddress = window.appData.deliveryLocation?.fromGPS
    ? window.appData.deliveryLocation.address
    : ''
  const savedPincode = window.appData.deliveryLocation?.fromGPS
    ? window.appData.deliveryLocation.pincode || ''
    : ''

  container.innerHTML = `
        <div class="checkout-section">
            <h4>Delivery Address</h4>
            <div class="form-group">
                <label>Full Name *</label>
                <input type="text" id="checkout-name" placeholder="Enter your full name" value="${window.appData.currentUser.name || ''}">
            </div>
            <div class="form-group">
                <label>Phone Number *</label>
                <input type="tel" id="checkout-phone" placeholder="Enter 10-digit mobile number" maxlength="10" value="${window.appData.currentUser.phone?.replace('+91 ', '') || ''}">
            </div>
            <div class="form-group">
                <label>Delivery Address *</label>
                <button type="button" onclick="fillAddressFromGPS()" style="display:flex;align-items:center;gap:6px;width:100%;padding:10px 14px;margin-bottom:8px;border:1.5px dashed var(--primary);border-radius:8px;background:var(--primary-light);color:var(--primary);font-size:14px;font-weight:500;cursor:pointer;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;">
                        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                        <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                        <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
                    </svg>
                    Use my current location
                </button>
                <textarea id="checkout-address" placeholder="House no., Building name, Street, Area">${savedAddress}</textarea>
            </div>
            <div class="form-group">
                <label>Pincode *</label>
                <input type="text" id="checkout-pincode" placeholder="Enter 6-digit pincode" maxlength="6" value="${savedPincode}">
            </div>
            <div class="form-group">
                <label>Landmark (optional)</label>
                <input type="text" id="checkout-landmark" placeholder="Near temple, next to park...">
            </div>
        </div>
        
        <div class="checkout-section">
            <h4>Delivery Options</h4>
            <div class="delivery-options">
                ${window.appData.deliveryOptions
                  .map(
                    (opt) => `
                    <div class="delivery-option ${state.deliveryOption === opt.id ? 'selected' : ''}" onclick="selectDeliveryOption('${opt.id}')">
                        <div class="radio"></div>
                        <div class="delivery-option-info">
                            <span class="delivery-option-title">${opt.name}</span>
                            <span class="delivery-option-desc">${opt.description}</span>
                        </div>
                        <span class="delivery-option-price">₹${opt.fee}</span>
                    </div>
                `,
                  )
                  .join('')}
            </div>
        </div>
        
        <div class="checkout-section">
            <h4>Order Summary</h4>
            <div class="checkout-summary">
                <div class="checkout-summary-row">
                    <span class="label">Item total (${state.cart.items.length} item${state.cart.items.length !== 1 ? 's' : ''})</span>
                    <span class="value">₹${itemTotal}</span>
                </div>
                <div class="checkout-summary-row">
                    <span class="label">Delivery Fee</span>
                    <span class="value">${deliveryFee === 0 ? '<span style="color:var(--accent)">Free</span>' : '₹' + deliveryFee}</span>
                </div>
                ${
                  state.cart.couponDiscount > 0
                    ? `
                    <div class="checkout-summary-row">
                        <span class="label" style="color: var(--accent);">Coupon (${state.cart.couponCode})</span>
                        <span class="value" style="color: var(--accent);">- ₹${state.cart.couponDiscount}</span>
                    </div>
                `
                    : ''
                }
                <div class="checkout-summary-total">
                    <span class="label">Total Amount</span>
                    <span class="value">₹${totalAmount}</span>
                </div>
            </div>
        </div>

        <div class="checkout-section" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px;">
            <p style="font-size: 13px; color: #166534; margin: 0;">
                📲 Your order details will be sent to our WhatsApp. We'll confirm your order and delivery slot shortly.
            </p>
        </div>
        
        <div class="checkout-footer">
            <button class="place-order-btn" onclick="sendOrderToWhatsApp()" style="background: #25D366; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 22px; height: 22px; flex-shrink: 0;">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Send Order on WhatsApp — ₹${totalAmount}
            </button>
        </div>
    `
}

// Called by the "Use my current location" button inside checkout
function fillAddressFromGPS() {
  requestGPSLocation(({ address, pincode }) => {
    const addrEl = document.getElementById('checkout-address')
    const pinEl = document.getElementById('checkout-pincode')
    if (addrEl) addrEl.value = address
    if (pinEl && pincode) pinEl.value = pincode
  })
}

function selectDeliveryOption(optionId) {
  state.deliveryOption = optionId
  renderCheckoutPage()
}

function sendOrderToWhatsApp() {
  const name = document.getElementById('checkout-name')?.value.trim()
  const phone = document.getElementById('checkout-phone')?.value.trim()
  const address = document.getElementById('checkout-address')?.value.trim()
  const pincode = document.getElementById('checkout-pincode')?.value.trim()
  const landmark = document.getElementById('checkout-landmark')?.value.trim()

  // Validation
  if (!name || !phone || !address || !pincode) {
    showToast('Please fill all required fields', 'error')
    return
  }
  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
    showToast('Please enter a valid 10-digit phone number', 'error')
    return
  }
  if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    showToast('Please enter a valid 6-digit pincode', 'error')
    return
  }

  // Totals — no hidden fees, just items + delivery
  const itemTotal = state.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const deliveryOption = window.appData.deliveryOptions.find(
    (o) => o.id === state.deliveryOption,
  )
  const deliveryFee = deliveryOption?.fee || 39
  const totalAmount = itemTotal + deliveryFee - state.cart.couponDiscount

  // Build the WhatsApp message
  const orderId = `ORD${Date.now().toString().slice(-6)}`

  const itemLines = state.cart.items
    .map(
      (item) =>
        `  • ${item.name} × ${item.quantity}  →  ₹${item.price * item.quantity}`,
    )
    .join('\n')

  const addressLine = [
    address,
    landmark ? `Near: ${landmark}` : '',
    `Pincode: ${pincode}`,
  ]
    .filter(Boolean)
    .join(', ')

  const message = [
    `🐟 *FreshCatch – New Order*`,
    `Order ID: *${orderId}*`,
    ``,
    `👤 *Customer Details*`,
    `Name: ${name}`,
    `Phone: +91 ${phone}`,
    ``,
    `📦 *Order Items*`,
    itemLines,
    ``,
    `💰 *Bill Summary*`,
    `Item Total:    ₹${itemTotal}`,
    `Delivery Fee:  ₹${deliveryFee}`,
    state.cart.couponDiscount > 0
      ? `Coupon (${state.cart.couponCode}): -₹${state.cart.couponDiscount}`
      : null,
    `*Total Amount: ₹${totalAmount}*`,
    ``,
    `📍 *Delivery Address*`,
    addressLine,
    ``,
    `🚚 *Delivery Slot*`,
    deliveryOption?.description || 'Tomorrow 6AM – 8AM',
    ``,
    `Payment: Cash on Delivery`,
  ]
    .filter((line) => line !== null)
    .join('\n')

  // Encode and open WhatsApp
  const waURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(waURL, '_blank')

  // Save order locally and clear cart
  const newOrder = {
    id: orderId,
    userId: window.appData.currentUser.id || 'guest',
    customerName: name,
    customerPhone: `+91 ${phone}`,
    address: addressLine,
    items: state.cart.items.map((item) => ({
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      image: item.image,
    })),
    itemTotal,
    deliveryFee,
    discount: state.cart.couponDiscount,
    totalAmount,
    deliverySlot: deliveryOption?.description || 'Tomorrow 6AM – 8AM',
    deliveryType: state.deliveryOption,
    status: 'pending',
    paymentMethod: 'COD',
    createdAt: new Date().toISOString(),
  }
  window.appData.orders.push(newOrder)

  // Clear cart
  state.cart = { items: [], couponCode: null, couponDiscount: 0 }
  updateCartUI()

  showToast('Opening WhatsApp with your order! 🎉', 'success')

  // Navigate to account/orders after a brief delay
  setTimeout(() => {
    navigateTo('account')
    showOrders()
  }, 1500)
}

// =====================================================
// SEARCH
// =====================================================

function openSearch() {
  navigateTo('search')
}

function handleSearch(query) {
  state.searchQuery = query
  const searchProducts = document.getElementById('search-products')
  const recentSearches = document.getElementById('recent-searches')

  if (!query || query.length < 2) {
    searchProducts.style.display = 'none'
    recentSearches.style.display = 'block'
    return
  }

  recentSearches.style.display = 'none'
  searchProducts.style.display = 'grid'

  const results = window.appData.products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase()) ||
      p.category.toLowerCase().includes(query.toLowerCase()),
  )

  if (results.length === 0) {
    searchProducts.innerHTML = `
            <div class="cart-empty" style="grid-column: 1/-1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
                <h3>No results found</h3>
                <p>Try searching with different keywords</p>
            </div>
        `
  } else {
    searchProducts.innerHTML = results.map(renderProductCard).join('')
  }
}

function searchFor(query) {
  document.getElementById('search-input').value = query
  handleSearch(query)
}

function clearSearch() {
  document.getElementById('search-input').value = ''
  state.searchQuery = ''
  document.getElementById('search-products').style.display = 'none'
  document.getElementById('recent-searches').style.display = 'block'
}

// =====================================================
// ACCOUNT
// =====================================================

function showOrders() {
  const ordersSection = document.getElementById('account-orders')
  const ordersList = document.getElementById('orders-list')

  ordersSection.style.display = 'block'

  const userOrders = window.appData.orders.filter(
    (o) => o.userId === window.appData.currentUser.id || o.userId === 'guest',
  )

  if (userOrders.length === 0) {
    ordersList.innerHTML = `
            <div class="cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1"/>
                </svg>
                <h3>No orders yet</h3>
                <p>Your order history will appear here</p>
            </div>
        `
  } else {
    ordersList.innerHTML = userOrders
      .map(
        (order) => `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <p class="order-id">${order.id}</p>
                        <p class="order-date">${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span class="order-status ${order.status}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
                </div>
                <div class="order-items">
                    ${order.items
                      .map(
                        (item) => `
                        <div class="order-item">
                            <img src="${item.image}" alt="${item.name}" class="order-item-image">
                            <div class="order-item-info">
                                <p class="order-item-name">${item.name}</p>
                                <p class="order-item-qty">Qty: ${item.quantity} × ₹${item.price}</p>
                            </div>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
                <div class="order-total">
                    <span>Total Amount</span>
                    <span>₹${order.totalAmount}</span>
                </div>
            </div>
        `,
      )
      .join('')
  }
}

function showAddresses() {
  showToast('Address management coming soon!', 'warning')
}

function showWallet() {
  showToast('Wallet feature coming soon!', 'warning')
}

function showSupport() {
  showToast('Contact us at support@freshcatch.com', 'success')
}

// =====================================================
// MODALS
// =====================================================

function openLocationModal() {
  document.getElementById('location-modal').classList.add('active')
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active')
}

function useCurrentLocation() {
  requestGPSLocation(({ address, pincode }) => {
    window.appData.deliveryLocation.fromGPS = true
    const display = address.split(',').slice(-2).join(',').trim()
    document.getElementById('delivery-address').textContent = display || address
    closeModal('location-modal')
  })
}

function setLocation() {
  const pincode = document.getElementById('pincode-input').value
  if (pincode.length !== 6) {
    showToast('Please enter a valid 6-digit pincode', 'error')
    return
  }

  window.appData.deliveryLocation = {
    address: `Pincode ${pincode}`,
    pincode: pincode,
    city: 'India',
  }
  document.getElementById('delivery-address').textContent =
    window.appData.deliveryLocation.address
  closeModal('location-modal')
  showToast('Delivery location updated!', 'success')
}

function openCouponModal() {
  const couponCode = prompt('Enter coupon code:')
  if (couponCode) {
    applyCoupon(couponCode.toUpperCase())
  }
}

function applyCoupon(code) {
  const coupon = window.appData.coupons.find((c) => c.code === code)
  const itemTotal = state.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  if (!coupon) {
    showToast('Invalid coupon code', 'error')
    return
  }

  if (itemTotal < coupon.minOrder) {
    showToast(
      `Minimum order ₹${coupon.minOrder} required for this coupon`,
      'error',
    )
    return
  }

  let discount = 0
  if (coupon.type === 'percentage') {
    discount = Math.min((itemTotal * coupon.discount) / 100, coupon.maxDiscount)
  } else {
    discount = coupon.discount
  }

  state.cart.couponCode = code
  state.cart.couponDiscount = Math.round(discount)

  showToast(
    `Coupon applied! You saved ₹${state.cart.couponDiscount}`,
    'success',
  )
  renderCartPage()
}

function applyOffer(code) {
  if (state.cart.items.length === 0) {
    showToast('Add items to cart first to apply offer', 'warning')
    return
  }
  applyCoupon(code)
}

// =====================================================
// TOAST NOTIFICATIONS
// =====================================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast ${type}`

  const icons = {
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  }

  toast.innerHTML = `${icons[type]}<span>${message}</span>`
  container.appendChild(toast)

  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s ease reverse'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

// =====================================================
// LOGIN/AUTH
// =====================================================

function openLoginModal() {
  document.getElementById('login-modal').classList.add('active')
}

function sendOTP() {
  const phone = document.getElementById('phone-input').value
  if (phone.length !== 10) {
    showToast('Please enter a valid 10-digit phone number', 'error')
    return
  }

  document.getElementById('otp-phone').textContent = `+91 ${phone}`
  closeModal('login-modal')
  document.getElementById('otp-modal').classList.add('active')

  // Start resend timer
  let timer = 30
  const resendBtn = document.getElementById('resend-btn')
  resendBtn.disabled = true
  const interval = setInterval(() => {
    timer--
    resendBtn.textContent = `Resend in 00:${timer.toString().padStart(2, '0')}`
    if (timer <= 0) {
      clearInterval(interval)
      resendBtn.disabled = false
      resendBtn.textContent = 'Resend OTP'
    }
  }, 1000)
}

function moveToNext(input, index) {
  if (input.value.length === 1 && index < 5) {
    const inputs = document.querySelectorAll('.otp-input')
    inputs[index]?.focus()
  }
}

function resendOTP() {
  showToast('OTP sent again!', 'success')
  // Restart timer
  let timer = 30
  const resendBtn = document.getElementById('resend-btn')
  resendBtn.disabled = true
  const interval = setInterval(() => {
    timer--
    resendBtn.textContent = `Resend in 00:${timer.toString().padStart(2, '0')}`
    if (timer <= 0) {
      clearInterval(interval)
      resendBtn.disabled = false
      resendBtn.textContent = 'Resend OTP'
    }
  }, 1000)
}

function verifyOTP() {
  const inputs = document.querySelectorAll('.otp-input')
  const otp = Array.from(inputs)
    .map((i) => i.value)
    .join('')

  if (otp.length !== 5) {
    showToast('Please enter complete OTP', 'error')
    return
  }

  // Demo: Accept any OTP
  window.appData.currentUser = {
    id: 'u1',
    name: 'Rahul Sharma',
    phone: document.getElementById('otp-phone').textContent,
    isLoggedIn: true,
  }

  document.getElementById('account-name').textContent =
    window.appData.currentUser.name
  document.getElementById('account-phone').textContent =
    window.appData.currentUser.phone

  closeModal('otp-modal')
  showToast('Login successful!', 'success')
}

// =====================================================
// FILTER
// =====================================================

function openFilters() {
  showToast('Filters coming soon!', 'warning')
}

// =====================================================
// ADMIN PANEL
// =====================================================

// =====================================================
// ADMIN PANEL — FULL PRODUCT MANAGEMENT
// =====================================================

function openAdminPanel() {
  if (!state.adminLoggedIn) {
    showAdminLoginModal()
    return
  }
  document.getElementById('admin-panel').style.display = 'flex'
  showAdminSection('dashboard')
}

function closeAdminPanel() {
  document.getElementById('admin-panel').style.display = 'none'
}

function adminLogout() {
  adminToken = null
  state.adminLoggedIn = false
  localStorage.removeItem('fc_admin_token')
  closeAdminPanel()
  showToast('Logged out of admin', 'success')
}

// ── Admin Login Modal ────────────────────────────────────────────
function showAdminLoginModal() {
  const existing = document.getElementById('admin-login-modal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.id = 'admin-login-modal'
  modal.className = 'modal active'
  modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeAdminLogin()"></div>
        <div class="modal-content" style="max-width:360px;">
            <div class="modal-header">
                <h3>Admin Login</h3>
                <button class="close-modal" onclick="closeAdminLogin()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="admin-login-user" placeholder="admin" autocomplete="username">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="admin-login-pass" placeholder="••••••••" autocomplete="current-password"
                        onkeydown="if(event.key==='Enter') doAdminLogin()">
                </div>
                <button class="btn btn-primary" onclick="doAdminLogin()" id="admin-login-btn">Login to Admin</button>
                <p id="admin-login-err" style="color:var(--error);font-size:13px;margin-top:8px;display:none;"></p>
            </div>
        </div>`
  document.body.appendChild(modal)
  setTimeout(() => document.getElementById('admin-login-user')?.focus(), 100)
}

function closeAdminLogin() {
  document.getElementById('admin-login-modal')?.remove()
}

async function doAdminLogin() {
  const username = document.getElementById('admin-login-user')?.value.trim()
  const password = document.getElementById('admin-login-pass')?.value
  const btn = document.getElementById('admin-login-btn')
  const errEl = document.getElementById('admin-login-err')

  if (!username || !password) {
    showAdminLoginError('Please enter username and password')
    return
  }

  btn.textContent = 'Logging in...'
  btn.disabled = true
  errEl.style.display = 'none'

  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    adminToken = res.token
    state.adminLoggedIn = true
    localStorage.setItem('fc_admin_token', adminToken)
    closeAdminLogin()
    showToast('Welcome to Admin Panel!', 'success')
    document.getElementById('admin-panel').style.display = 'flex'
    showAdminSection('dashboard')
  } catch (err) {
    showAdminLoginError(err.message || 'Invalid credentials')
    btn.textContent = 'Login to Admin'
    btn.disabled = false
  }
}

function showAdminLoginError(msg) {
  const el = document.getElementById('admin-login-err')
  if (el) {
    el.textContent = msg
    el.style.display = 'block'
  }
}

// ── Admin Section Router ─────────────────────────────────────────
function showAdminSection(section) {
  document.querySelectorAll('.admin-nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === section)
  })
  const titles = {
    dashboard: 'Dashboard',
    products: 'Product Management',
    orders: 'Orders',
    categories: 'Categories',
    hero: 'Hero Banners',
    reports: 'Reports',
    users: 'Users',
  }
  document.getElementById('admin-page-title').textContent =
    titles[section] || section

  const content = document.getElementById('admin-content')
  switch (section) {
    case 'dashboard':
      renderAdminDashboard(content)
      break
    case 'products':
      renderAdminProducts(content)
      break
    case 'orders':
      renderAdminOrders(content)
      break
    case 'categories':
      renderAdminCategories(content)
      break
    case 'hero':
      renderAdminHero(content)
      break
    case 'reports':
      renderAdminReports(content)
      break
    case 'users':
      renderAdminUsers(content)
      break
  }
}

// ─────────────────────────────────────────────────────────────────
// ADMIN — PRODUCT MANAGEMENT (fully working)
// ─────────────────────────────────────────────────────────────────

let adminProductState = {
  search: '',
  category: 'all',
  page: 1,
  loading: false,
}

async function renderAdminProducts(container) {
  container.innerHTML = `
        <div class="admin-card">
            <div class="admin-card-header">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <h4 id="admin-prod-count">Products</h4>
                    <div style="display:flex;gap:8px;flex:1;min-width:200px;">
                        <input type="text" id="admin-prod-search" placeholder="Search products..."
                            style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
                            oninput="debounceAdminProdSearch(this.value)">
                        <select id="admin-prod-cat" onchange="filterAdminProducts()"
                            style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:white;">
                            <option value="all">All Categories</option>
                            ${window.appData.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="showProductForm(null)"
                    style="width:auto;padding:8px 16px;white-space:nowrap;">
                    + Add Product
                </button>
            </div>
            <div class="admin-card-body" style="padding:0;" id="admin-prod-body">
                <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading products...</div>
            </div>
        </div>`
  await loadAdminProducts()
}

let _prodSearchTimer
function debounceAdminProdSearch(val) {
  clearTimeout(_prodSearchTimer)
  _prodSearchTimer = setTimeout(() => {
    adminProductState.search = val
    adminProductState.page = 1
    loadAdminProducts()
  }, 350)
}

function filterAdminProducts() {
  adminProductState.category =
    document.getElementById('admin-prod-cat')?.value || 'all'
  adminProductState.page = 1
  loadAdminProducts()
}

async function loadAdminProducts() {
  const body = document.getElementById('admin-prod-body')
  if (!body) return
  body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading...</div>`

  try {
    const { search, category, page } = adminProductState
    let qs = `?page=${page}&limit=20`
    if (search) qs += `&search=${encodeURIComponent(search)}`
    if (category && category !== 'all') qs += `&category=${category}`

    const res = await api(`/products/admin${qs}`)
    const products = res.data

    const countEl = document.getElementById('admin-prod-count')
    if (countEl) countEl.textContent = `Products (${res.total})`

    if (!products.length) {
      body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">No products found</div>`
      return
    }

    body.innerHTML = `
            <table class="admin-table">
                <thead><tr>
                    <th>Product</th><th>Category</th>
                    <th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                    ${products
                      .map(
                        (p) => `
                        <tr id="prod-row-${p._id}">
                            <td>
                                <div class="product-cell">
                                    <img src="${p.images[0] || 'https://via.placeholder.com/40'}"
                                        class="product-image" alt="${p.name}"
                                        onerror="this.src='https://via.placeholder.com/40'">
                                    <div>
                                        <div style="font-weight:600;font-size:13px;">${p.name}</div>
                                        <div style="font-size:11px;color:var(--text-muted);">${p.weight} · ${p.pieces}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span style="font-size:12px;background:var(--surface);padding:3px 8px;border-radius:20px;">
                                    ${p.category}
                                </span>
                            </td>
                            <td>
                                <div style="font-weight:700;">₹${p.price}</div>
                                ${p.originalPrice > p.price ? `<div style="font-size:11px;color:var(--text-muted);text-decoration:line-through;">₹${p.originalPrice}</div>` : ''}
                            </td>
                            <td>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input type="number" min="0" value="${p.stockQty}"
                                        style="width:60px;padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
                                        onchange="quickUpdateStock('${p._id}', this.value)">
                                </div>
                            </td>
                            <td>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                    <input type="checkbox" ${p.inStock ? 'checked' : ''}
                                        onchange="quickToggleStock('${p._id}', this.checked)"
                                        style="width:16px;height:16px;cursor:pointer;">
                                    <span class="status ${p.inStock ? (p.stockQty < 10 ? 'low-stock' : 'in-stock') : 'out-of-stock'}" id="stock-badge-${p._id}">
                                        ${p.inStock ? (p.stockQty < 10 ? 'Low Stock' : 'In Stock') : 'Out of Stock'}
                                    </span>
                                </label>
                                ${!p.isActive ? `<span style="font-size:11px;color:var(--error);">Hidden</span>` : ''}
                            </td>
                            <td>
                                <div class="admin-actions">
                                    <button class="admin-action-btn edit" title="Edit product"
                                        onclick="showProductForm('${p._id}')">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                    </button>
                                    <button class="admin-action-btn" title="${p.isActive ? 'Hide product' : 'Show product'}"
                                        onclick="toggleProductActive('${p._id}', ${p.isActive})"
                                        style="color:${p.isActive ? 'var(--warning)' : 'var(--accent)'}">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            ${
                                              p.isActive
                                                ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                                                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                                            }
                                        </svg>
                                    </button>
                                    <button class="admin-action-btn delete" title="Delete product"
                                        onclick="deleteProduct('${p._id}', '${p.name.replace(/'/g, "\\'")}')">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3,6 5,6 21,6"/>
                                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                            </td>
                        </tr>`,
                      )
                      .join('')}
                </tbody>
            </table>
            ${
              res.pages > 1
                ? `
                <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
                    ${Array.from(
                      { length: res.pages },
                      (_, i) => `
                        <button onclick="adminProductState.page=${i + 1};loadAdminProducts()"
                            style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);
                                   background:${adminProductState.page === i + 1 ? 'var(--primary)' : 'white'};
                                   color:${adminProductState.page === i + 1 ? 'white' : 'var(--text-primary)'};
                                   font-size:13px;cursor:pointer;">${i + 1}</button>`,
                    ).join('')}
                </div>`
                : ''
            }`
  } catch (err) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--error);">${err.message}</div>`
  }
}

// ── Quick inline stock update ────────────────────────────────────
async function quickUpdateStock(id, qty) {
  try {
    const q = parseInt(qty, 10)
    await api(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stockQty: q, inStock: q > 0 }),
    })
    const badge = document.getElementById(`stock-badge-${id}`)
    if (badge) {
      badge.className = `status ${q > 0 ? (q < 10 ? 'low-stock' : 'in-stock') : 'out-of-stock'}`
      badge.textContent =
        q > 0 ? (q < 10 ? 'Low Stock' : 'In Stock') : 'Out of Stock'
    }
    // Update local data too
    const p = window.appData.products.find((p) => p._id === id || p.id === id)
    if (p) {
      p.stockQty = q
      p.inStock = q > 0
    }
    refreshProductCards()
  } catch (err) {
    showToast('Failed to update stock: ' + err.message, 'error')
  }
}

async function quickToggleStock(id, inStock) {
  try {
    await api(`/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock }),
    })
    const badge = document.getElementById(`stock-badge-${id}`)
    if (badge) {
      badge.className = `status ${inStock ? 'in-stock' : 'out-of-stock'}`
      badge.textContent = inStock ? 'In Stock' : 'Out of Stock'
    }
    const p = window.appData.products.find((p) => p._id === id || p.id === id)
    if (p) p.inStock = inStock
    refreshProductCards()
  } catch (err) {
    showToast('Failed: ' + err.message, 'error')
  }
}

async function toggleProductActive(id, currentlyActive) {
  try {
    await api(`/products/${id}/toggle-active`, { method: 'PATCH' })
    showToast(
      `Product ${currentlyActive ? 'hidden from' : 'shown in'} store`,
      'success',
    )
    await loadAdminProducts()
    await loadLiveData()
  } catch (err) {
    showToast('Failed: ' + err.message, 'error')
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}" permanently? This cannot be undone.`)) return
  try {
    await api(`/products/${id}`, { method: 'DELETE' })
    showToast(`"${name}" deleted`, 'success')
    window.appData.products = window.appData.products.filter(
      (p) => p._id !== id && p.id !== id,
    )
    await loadAdminProducts()
    refreshProductCards()
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error')
  }
}

// ── Product Form (Add / Edit) ─────────────────────────────────────
async function showProductForm(productId) {
  let product = null
  if (productId) {
    try {
      const res = await api(`/products/${productId}`)
      product = res.data
    } catch (err) {
      showToast('Could not load product: ' + err.message, 'error')
      return
    }
  }

  const isEdit = !!product
  const p = product || {}

  // Remove old form if exists
  document.getElementById('product-form-modal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'product-form-modal'
  modal.style.cssText =
    'position:fixed;inset:0;z-index:600;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px;background:rgba(0,0,0,0.5);'

  const CATEGORIES = [
    { id: 'fish', label: 'Fish & Seafood' },
    { id: 'prawns', label: 'Prawns & Shrimps' },
    { id: 'crabs', label: 'Crabs & Lobsters' },
    { id: 'squid', label: 'Squid & Octopus' },
    { id: 'ready-to-cook', label: 'Ready to Cook' },
    { id: 'combos', label: 'Seafood Combos' },
    { id: 'dried', label: 'Dried Seafood' },
    { id: 'specials', label: 'Chef Specials' },
  ]

  modal.innerHTML = `
        <div style="background:white;border-radius:16px;width:100%;max-width:640px;margin:auto;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);background:var(--surface);">
                <h3 style="font-size:18px;font-weight:700;">${isEdit ? 'Edit Product' : 'Add New Product'}</h3>
                <button onclick="document.getElementById('product-form-modal').remove()"
                    style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--surface-dark);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>

            <div style="padding:24px;display:flex;flex-direction:column;gap:16px;">

                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Product Name *</label>
                        <input type="text" id="pf-name" value="${p.name || ''}" placeholder="e.g. Tiger Prawns - Large">
                    </div>
                    <div class="form-group">
                        <label>Category *</label>
                        <select id="pf-category" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                            ${CATEGORIES.map((c) => `<option value="${c.id}" ${p.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>Description *</label>
                    <textarea id="pf-desc" rows="2" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);resize:vertical;" placeholder="Short product description">${p.description || ''}</textarea>
                </div>

                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Subcategory</label>
                        <input type="text" id="pf-subcat" value="${p.subcategory || ''}" placeholder="e.g. tiger-prawns">
                    </div>
                    <div class="form-group">
                        <label>Badge</label>
                        <select id="pf-badge" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                            <option value="" ${!p.badge ? 'selected' : ''}>None</option>
                            <option value="bestseller" ${p.badge === 'bestseller' ? 'selected' : ''}>Bestseller</option>
                            <option value="new" ${p.badge === 'new' ? 'selected' : ''}>New</option>
                            <option value="premium" ${p.badge === 'premium' ? 'selected' : ''}>Premium</option>
                        </select>
                    </div>
                </div>

                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Selling Price (₹) *</label>
                        <input type="number" id="pf-price" value="${p.price || ''}" placeholder="499" min="0" oninput="calcDiscount()">
                    </div>
                    <div class="form-group">
                        <label>Original / MRP (₹) *</label>
                        <input type="number" id="pf-original" value="${p.originalPrice || ''}" placeholder="599" min="0" oninput="calcDiscount()">
                    </div>
                </div>

                <div style="background:var(--surface);border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;color:var(--text-secondary);">
                    Discount: <strong id="pf-discount-preview" style="color:var(--accent);">${p.discount || 0}% off</strong>
                </div>

                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Weight *</label>
                        <input type="text" id="pf-weight" value="${p.weight || ''}" placeholder="500g">
                    </div>
                    <div class="form-group">
                        <label>Pieces</label>
                        <input type="text" id="pf-pieces" value="${p.pieces || ''}" placeholder="15-18 Pieces">
                    </div>
                </div>

                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Serves</label>
                        <input type="text" id="pf-serves" value="${p.serves || ''}" placeholder="3-4">
                    </div>
                    <div class="form-group">
                        <label>Stock Quantity *</label>
                        <input type="number" id="pf-stock" value="${p.stockQty ?? ''}" placeholder="25" min="0">
                    </div>
                </div>

                <div class="form-group">
                    <label>Product Image URLs</label>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
                        Upload photos to <a href="https://imgbb.com" target="_blank" style="color:var(--primary);">imgbb.com</a> (free) and paste the direct links below. One URL per line.
                    </p>
                    <textarea id="pf-images" rows="3" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:monospace;resize:vertical;"
                        placeholder="https://i.ibb.co/abc123/product.jpg&#10;https://i.ibb.co/xyz456/product2.jpg">${(p.images || []).join('\n')}</textarea>
                    <div id="pf-image-preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                        ${(p.images || []).map((img) => (img ? `<img src="${img}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display='none'">` : '')).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label>Product Highlights</label>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">One highlight per line (max 6)</p>
                    <textarea id="pf-highlights" rows="4" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);resize:vertical;"
                        placeholder="No added chemicals&#10;Cleaned &amp; ready to cook&#10;Lab tested&#10;Sourced fresh daily">${(p.highlights || []).join('\n')}</textarea>
                </div>

                <div id="pf-error" style="color:var(--error);font-size:13px;display:none;padding:10px;background:#FEE2E2;border-radius:8px;"></div>

                <div style="display:flex;gap:12px;padding-top:8px;">
                    <button onclick="document.getElementById('product-form-modal').remove()"
                        style="flex:1;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:15px;font-weight:600;background:white;cursor:pointer;">
                        Cancel
                    </button>
                    <button onclick="saveProduct(${isEdit ? `'${productId}'` : 'null'})" id="pf-save-btn"
                        style="flex:2;padding:14px;background:var(--primary);color:white;border-radius:var(--radius-md);font-size:15px;font-weight:700;cursor:pointer;">
                        ${isEdit ? 'Save Changes' : 'Add Product'}
                    </button>
                </div>

            </div>
        </div>`

  document.body.appendChild(modal)

  // Live image preview on URL change
  document.getElementById('pf-images').addEventListener('input', function () {
    const urls = this.value
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
    document.getElementById('pf-image-preview').innerHTML = urls
      .map(
        (url) =>
          `<img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display='none'">`,
      )
      .join('')
  })
}

function calcDiscount() {
  const price = parseFloat(document.getElementById('pf-price')?.value || 0)
  const orig = parseFloat(document.getElementById('pf-original')?.value || 0)
  const el = document.getElementById('pf-discount-preview')
  if (!el) return
  if (orig > price && price > 0) {
    el.textContent = Math.round(((orig - price) / orig) * 100) + '% off'
  } else {
    el.textContent = '0% off'
  }
}

async function saveProduct(productId) {
  const btn = document.getElementById('pf-save-btn')
  const errEl = document.getElementById('pf-error')
  errEl.style.display = 'none'

  const name = document.getElementById('pf-name')?.value.trim()
  const desc = document.getElementById('pf-desc')?.value.trim()
  const category = document.getElementById('pf-category')?.value
  const price = parseFloat(document.getElementById('pf-price')?.value)
  const original = parseFloat(document.getElementById('pf-original')?.value)
  const stock = parseInt(document.getElementById('pf-stock')?.value, 10)
  const weight = document.getElementById('pf-weight')?.value.trim()

  // Validate
  const errors = []
  if (!name) errors.push('Product name is required')
  if (!desc) errors.push('Description is required')
  if (!weight) errors.push('Weight is required')
  if (isNaN(price) || price < 0) errors.push('Valid selling price required')
  if (isNaN(original) || original < 0)
    errors.push('Valid original price required')
  if (isNaN(stock) || stock < 0) errors.push('Valid stock quantity required')

  if (errors.length) {
    errEl.textContent = errors.join(' · ')
    errEl.style.display = 'block'
    return
  }

  const images =
    document
      .getElementById('pf-images')
      ?.value.split('\n')
      .map((u) => u.trim())
      .filter(Boolean) || []
  const highlights =
    document
      .getElementById('pf-highlights')
      ?.value.split('\n')
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 6) || []

  const payload = {
    name,
    description: desc,
    category,
    subcategory: document.getElementById('pf-subcat')?.value.trim() || '',
    badge: document.getElementById('pf-badge')?.value || '',
    weight,
    pieces: document.getElementById('pf-pieces')?.value.trim() || '',
    serves: document.getElementById('pf-serves')?.value.trim() || '',
    price,
    originalPrice: original,
    stockQty: stock,
    inStock: stock > 0,
    images,
    highlights,
  }

  btn.textContent = productId ? 'Saving...' : 'Adding...'
  btn.disabled = true

  try {
    let res
    if (productId) {
      res = await api(`/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      // Update local appData
      const idx = window.appData.products.findIndex(
        (p) => p._id === productId || p.id === productId,
      )
      if (idx !== -1)
        window.appData.products[idx] = { ...res.data, id: res.data._id }
    } else {
      res = await api('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      window.appData.products.unshift({ ...res.data, id: res.data._id })
    }

    document.getElementById('product-form-modal').remove()
    showToast(res.message, 'success')
    await loadAdminProducts()
    refreshProductCards()
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save product'
    errEl.style.display = 'block'
    btn.textContent = productId ? 'Save Changes' : 'Add Product'
    btn.disabled = false
  }
}

function renderAdminDashboard(container) {
  const data = window.appData.reportsData

  container.innerHTML = `
        <div class="admin-stats">
            <div class="stat-card">
                <p class="label">Total Revenue</p>
                <p class="value">₹${data.totalRevenue.toLocaleString()}</p>
                <p class="change positive">+${data.revenueGrowth}% from last month</p>
            </div>
            <div class="stat-card">
                <p class="label">Total Orders</p>
                <p class="value">${data.totalOrders}</p>
                <p class="change positive">+${data.orderGrowth}% from last month</p>
            </div>
            <div class="stat-card">
                <p class="label">Total Customers</p>
                <p class="value">${data.totalCustomers}</p>
                <p class="change positive">+${data.customerGrowth}% from last month</p>
            </div>
            <div class="stat-card">
                <p class="label">Avg. Order Value</p>
                <p class="value">₹${data.averageOrderValue}</p>
                <p class="change positive">+5.2% from last month</p>
            </div>
        </div>
        
        <div class="admin-grid">
            <div class="admin-card">
                <div class="admin-card-header">
                    <h4>Revenue Overview</h4>
                </div>
                <div class="admin-card-body">
                    <div class="chart-placeholder">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px;">
                                <line x1="18" y1="20" x2="18" y2="10"/>
                                <line x1="12" y1="20" x2="12" y2="4"/>
                                <line x1="6" y1="20" x2="6" y2="14"/>
                            </svg>
                            <span>Revenue Chart - ${data.dailyRevenue.map((d) => `₹${(d.revenue / 1000).toFixed(1)}K`).join(' | ')}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="admin-card">
                <div class="admin-card-header">
                    <h4>Recent Orders</h4>
                </div>
                <div class="admin-card-body">
                    <div class="recent-orders-list">
                        ${window.appData.orders
                          .slice(0, 5)
                          .map(
                            (order) => `
                            <div class="recent-order-item">
                                <div class="order-info">
                                    <p class="order-id">${order.id}</p>
                                    <p class="order-customer">${order.customerName}</p>
                                </div>
                                <span class="order-status ${order.status}" style="margin-right: 8px;">${order.status}</span>
                                <span class="order-amount">₹${order.totalAmount}</span>
                            </div>
                        `,
                          )
                          .join('')}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="admin-card" style="margin-top: 24px;">
            <div class="admin-card-header">
                <h4>Top Selling Products</h4>
            </div>
            <div class="admin-card-body" style="padding: 0;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Units Sold</th>
                            <th>Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.topProducts
                          .map((p) => {
                            const product = window.appData.products.find(
                              (prod) => prod.id === p.id,
                            )
                            return `
                                <tr>
                                    <td>
                                        <div class="product-cell">
                                            <img src="${product?.images[0] || ''}" class="product-image" alt="">
                                            <span>${p.name}</span>
                                        </div>
                                    </td>
                                    <td>${p.sales}</td>
                                    <td>₹${p.revenue.toLocaleString()}</td>
                                </tr>
                            `
                          })
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `
}

function renderAdminOrders(container) {
  const pendingOrders = window.appData.orders.filter(
    (o) => o.status === 'pending',
  )
  const confirmedOrders = window.appData.orders.filter(
    (o) => o.status === 'confirmed',
  )
  const allOrders = window.appData.orders

  container.innerHTML = `
        <div class="admin-stats" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 24px;">
            <div class="stat-card">
                <p class="label">Pending Orders</p>
                <p class="value" style="color: var(--warning);">${pendingOrders.length}</p>
            </div>
            <div class="stat-card">
                <p class="label">Confirmed Orders</p>
                <p class="value" style="color: var(--primary);">${confirmedOrders.length}</p>
            </div>
            <div class="stat-card">
                <p class="label">Delivered</p>
                <p class="value" style="color: var(--accent);">${window.appData.orders.filter((o) => o.status === 'delivered').length}</p>
            </div>
            <div class="stat-card">
                <p class="label">Cancelled</p>
                <p class="value" style="color: var(--error);">${window.appData.orders.filter((o) => o.status === 'cancelled').length}</p>
            </div>
        </div>
        
        <div class="admin-card">
            <div class="admin-card-header">
                <h4>All Orders (${allOrders.length})</h4>
            </div>
            <div class="admin-card-body" style="padding: 0;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allOrders
                          .map(
                            (order) => `
                            <tr>
                                <td><strong>${order.id}</strong></td>
                                <td>
                                    <div>
                                        <p style="font-weight: 500;">${order.customerName}</p>
                                        <p style="font-size: 12px; color: var(--text-muted);">${order.customerPhone}</p>
                                    </div>
                                </td>
                                <td>${order.items.length} items</td>
                                <td>₹${order.totalAmount}</td>
                                <td>
                                    <span class="status ${order.status === 'pending' ? 'low-stock' : order.status === 'confirmed' ? 'in-stock' : order.status === 'delivered' ? 'in-stock' : 'out-of-stock'}">
                                        ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                    </span>
                                </td>
                                <td>${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                <td>
                                    <div class="admin-actions">
                                        <button class="admin-action-btn" onclick="viewOrderDetails('${order.id}')">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                                <circle cx="12" cy="12" r="3"/>
                                            </svg>
                                        </button>
                                        ${
                                          order.status === 'pending'
                                            ? `
                                            <button class="admin-action-btn edit" onclick="confirmOrder('${order.id}')">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M20 6L9 17l-5-5"/>
                                                </svg>
                                            </button>
                                        `
                                            : ''
                                        }
                                    </div>
                                </td>
                            </tr>
                        `,
                          )
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `
}

function renderAdminCategories(container) {
  container.innerHTML = `
        <div class="admin-card">
            <div class="admin-card-header">
                <h4>All Categories (${window.appData.categories.length})</h4>
                <button class="btn btn-primary" style="width: auto; padding: 8px 16px;">
                    + Add Category
                </button>
            </div>
            <div class="admin-card-body" style="padding: 0;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Subcategories</th>
                            <th>Products</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${window.appData.categories
                          .map((cat) => {
                            const productCount = window.appData.products.filter(
                              (p) => p.category === cat.id,
                            ).length
                            return `
                                <tr>
                                    <td>
                                        <div class="product-cell">
                                            <img src="${cat.image}" class="product-image" alt="${cat.name}">
                                            <span>${cat.name}</span>
                                        </div>
                                    </td>
                                    <td>${cat.description}</td>
                                    <td>${cat.subcategories.length}</td>
                                    <td>${productCount}</td>
                                    <td>
                                        <div class="admin-actions">
                                            <button class="admin-action-btn edit">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `
                          })
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `
}

function renderAdminHero(container) {
  container.innerHTML = `
        <div class="admin-card">
            <div class="admin-card-header">
                <h4>Hero Banners (${window.appData.heroBanners.length})</h4>
                <button class="btn btn-primary" style="width: auto; padding: 8px 16px;">
                    + Add Banner
                </button>
            </div>
            <div class="admin-card-body">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                    ${window.appData.heroBanners
                      .map(
                        (banner) => `
                        <div style="border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">
                            <div style="position: relative; height: 150px;">
                                <img src="${banner.image}" style="width: 100%; height: 100%; object-fit: cover;">
                                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); padding: 16px; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                                    <span style="font-size: 10px; background: var(--primary); padding: 2px 8px; border-radius: 10px; width: fit-content; margin-bottom: 4px;">${banner.badge}</span>
                                    <h4 style="font-size: 16px; font-weight: 700;">${banner.title}</h4>
                                    <p style="font-size: 12px; opacity: 0.9;">${banner.subtitle}</p>
                                </div>
                            </div>
                            <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <p style="font-size: 12px; color: var(--text-muted);">Links to: ${banner.linkType} - ${banner.linkId}</p>
                                </div>
                                <div class="admin-actions">
                                    <button class="admin-action-btn edit">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                    </button>
                                    <button class="admin-action-btn delete">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3,6 5,6 21,6"/>
                                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
        </div>
    `
}

function renderAdminReports(container) {
  const data = window.appData.reportsData

  container.innerHTML = `
        <div class="admin-stats">
            <div class="stat-card">
                <p class="label">Total Revenue</p>
                <p class="value">₹${data.totalRevenue.toLocaleString()}</p>
                <p class="change positive">+${data.revenueGrowth}%</p>
            </div>
            <div class="stat-card">
                <p class="label">Total Orders</p>
                <p class="value">${data.totalOrders}</p>
                <p class="change positive">+${data.orderGrowth}%</p>
            </div>
            <div class="stat-card">
                <p class="label">Customers</p>
                <p class="value">${data.totalCustomers}</p>
                <p class="change positive">+${data.customerGrowth}%</p>
            </div>
            <div class="stat-card">
                <p class="label">Avg. Order Value</p>
                <p class="value">₹${data.averageOrderValue}</p>
                <p class="change positive">+5.2%</p>
            </div>
        </div>
        
        <div class="admin-grid" style="margin-top: 24px;">
            <div class="admin-card">
                <div class="admin-card-header">
                    <h4>Sales Overview (Last 7 Days)</h4>
                </div>
                <div class="admin-card-body">
                    <div class="chart-placeholder" style="height: 300px;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: space-around; padding: 20px;">
                            ${data.dailyRevenue
                              .map(
                                (d) => `
                                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                                    <div style="width: 40px; background: var(--primary); border-radius: 4px 4px 0 0; height: ${(d.revenue / 30000) * 200}px;"></div>
                                    <span style="font-size: 10px; color: var(--text-muted);">${new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                </div>
                            `,
                              )
                              .join('')}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="admin-card">
                <div class="admin-card-header">
                    <h4>Orders by Status</h4>
                </div>
                <div class="admin-card-body">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>Pending</span>
                            <div style="flex: 1; margin: 0 16px; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${(data.ordersByStatus.pending / data.totalOrders) * 100}%; height: 100%; background: var(--warning);"></div>
                            </div>
                            <span style="font-weight: 600;">${data.ordersByStatus.pending}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>Confirmed</span>
                            <div style="flex: 1; margin: 0 16px; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${(data.ordersByStatus.confirmed / data.totalOrders) * 100}%; height: 100%; background: var(--primary);"></div>
                            </div>
                            <span style="font-weight: 600;">${data.ordersByStatus.confirmed}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>Delivered</span>
                            <div style="flex: 1; margin: 0 16px; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${(data.ordersByStatus.delivered / data.totalOrders) * 100}%; height: 100%; background: var(--accent);"></div>
                            </div>
                            <span style="font-weight: 600;">${data.ordersByStatus.delivered}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>Cancelled</span>
                            <div style="flex: 1; margin: 0 16px; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${(data.ordersByStatus.cancelled / data.totalOrders) * 100}%; height: 100%; background: var(--error);"></div>
                            </div>
                            <span style="font-weight: 600;">${data.ordersByStatus.cancelled}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
}

function renderAdminUsers(container) {
  container.innerHTML = `
        <div class="admin-card">
            <div class="admin-card-header">
                <h4>All Users (${window.appData.users.length})</h4>
            </div>
            <div class="admin-card-body" style="padding: 0;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Wallet Balance</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${window.appData.users
                          .map(
                            (user) => `
                            <tr>
                                <td><strong>${user.name}</strong></td>
                                <td>${user.phone}</td>
                                <td>${user.email}</td>
                                <td>₹${user.walletBalance}</td>
                                <td>${new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td>
                                    <div class="admin-actions">
                                        <button class="admin-action-btn">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                                <circle cx="12" cy="12" r="3"/>
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `,
                          )
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `
}

// Legacy wrappers kept for any inline references still in HTML
function editProduct(id) {
  showProductForm(id)
}
function toggleProductStock(id) {
  const p = window.appData.products.find((p) => p._id === id || p.id === id)
  if (p) quickToggleStock(id, !p.inStock)
}
function showAddProductForm() {
  showProductForm(null)
}

// Initialize
console.log('FreshCatch App Loaded!')
