const https = require('https')

function httpsPost(url, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const urlObj = new URL(url)
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }
    const req = https.request(opts, (res) => {
      let raw = ''
      res.on('data', (d) => (raw += d))
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: JSON.parse(raw),
          })
        } catch {
          resolve({ ok: false, status: res.statusCode, data: raw })
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function sendWhatsAppMessage(to, message) {
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!pid || !token) {
    console.log('[WhatsApp DEV] To:', to, '\n', message)
    return { success: false, reason: 'not_configured' }
  }
  const phone = to.replace(/[^0-9]/g, '')
  try {
    const res = await httpsPost(
      `https://graph.facebook.com/v19.0/${pid}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: message },
      },
      { Authorization: `Bearer ${token}` },
    )
    if (!res.ok)
      throw new Error(res.data?.error?.message || `HTTP ${res.status}`)
    return { success: true }
  } catch (err) {
    console.error('[WhatsApp] Error:', err.message)
    return { success: false, reason: err.message }
  }
}

async function sendOTP(phone, otp) {
  return sendWhatsAppMessage(
    phone,
    `🐟 *The Fish Merchant*\n\nYour OTP is: *${otp}*\n\nValid for 10 minutes. Do not share this with anyone.\n\n_Team The Fish Merchant_`,
  )
}

async function notifyNewOrder(order) {
  const biz = process.env.BUSINESS_WHATSAPP
  if (!biz) return
  const items = order.items
    .map((i) => `  • ${i.name} × ${i.quantity} = ₹${i.price * i.quantity}`)
    .join('\n')
  return sendWhatsAppMessage(
    biz,
    `🆕 *New Order — ${order.orderId}*\n\n👤 ${order.customerName}\n📞 ${order.customerPhone}\n📍 ${order.address}${order.landmark ? ', ' + order.landmark : ''}, ${order.pincode}\n\n📦 *Items:*\n${items}\n\n💰 Item Total: ₹${order.itemTotal}\n${order.discount > 0 ? `🎟 Discount: -₹${order.discount}\n` : ''}*Customer Total: ₹${order.totalAmount}*\n\n💵 Payment: ${order.paymentMethod}\n⚠️ Delivery charge to be set when confirming`,
  )
}

// Full invoice confirmation message sent to customer
async function sendOrderConfirmation(order) {
  if (!order.customerPhone) return
  const items = order.items
    .map((i) => `  • ${i.name} × ${i.quantity}  →  ₹${i.price * i.quantity}`)
    .join('\n')
  const invoiceLines = [
    `🧾 *INVOICE — The Fish Merchant*`,
    `Order ID: *${order.orderId}*`,
    `Date: ${new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ``,
    `📦 *Items Ordered*`,
    items,
    ``,
    `💰 *Bill Summary*`,
    `Item Total:    ₹${order.itemTotal}`,
    `Delivery Fee:  ₹${order.deliveryFee}`,
    ...(order.discount > 0 ? [`Discount:      -₹${order.discount}`] : []),
    `*Amount to Pay: ₹${order.totalAmount}*`,
    ``,
    `📍 *Delivery Address*`,
    `${order.address}${order.landmark ? ', Near: ' + order.landmark : ''}, ${order.pincode}`,
    ``,
    `✅ *Your order is confirmed!*`,
    `🚚 Delivery within 2 hours.`,
    `💵 Payment: ${order.paymentMethod}`,
    ``,
    `Track your order: Reply *STATUS* to this message`,
    `Issues? Reply *HELP*`,
    ``,
    `Thank you for choosing The Fish Merchant! 🐟`,
  ].join('\n')
  return sendWhatsAppMessage(order.customerPhone, invoiceLines)
}

async function notifyCustomerStatus(order) {
  // For confirmed orders, send full invoice instead of simple message
  if (order.status === 'confirmed') {
    return sendOrderConfirmation(order)
  }
  const msgs = {
    preparing: `🔪 Your order *${order.orderId}* is being cleaned & packed fresh.`,
    out_for_delivery: `🚚 Your order *${order.orderId}* is on the way! Delivered within 2 hours of confirmation.`,
    delivered: `✅ Order *${order.orderId}* delivered! Enjoy your meal!\n\nRate your experience or report an issue by replying to this message.\n\nThank you for choosing *The Fish Merchant* 🐟`,
    cancelled: `❌ Order *${order.orderId}* has been cancelled.${order.cancelReason ? '\nReason: ' + order.cancelReason : ''}\n\nFor refund queries, reply to this message.`,
  }
  const msg = msgs[order.status]
  if (!msg || !order.customerPhone) return
  return sendWhatsAppMessage(
    order.customerPhone,
    `🐟 *The Fish Merchant*\n\n${msg}`,
  )
}

module.exports = {
  sendOTP,
  notifyNewOrder,
  notifyCustomerStatus,
  sendWhatsAppMessage,
  sendOrderConfirmation,
}
