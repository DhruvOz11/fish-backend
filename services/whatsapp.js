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
    `🐟 *FreshCatch*\n\nYour login OTP is: *${otp}*\n\nValid for 10 minutes. Do not share this with anyone.`,
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
    `🆕 *New Order — ${order.orderId}*\n\n👤 ${order.customerName}\n📞 ${order.customerPhone}\n📍 ${order.address}, ${order.pincode}\n\n📦 *Items:*\n${items}\n\n💰 Items: ₹${order.itemTotal}\n*Total: ₹${order.totalAmount}*\n💵 ${order.paymentMethod}`,
  )
}

async function notifyCustomerStatus(order) {
  const msgs = {
    confirmed: `✅ Your order *${order.orderId}* has been confirmed! We'll prepare your fresh catch soon.`,
    preparing: `🔪 Your order *${order.orderId}* is being cleaned & packed fresh.`,
    out_for_delivery: `🚚 Your order *${order.orderId}* is on the way to you!`,
    delivered: `🐟 Order *${order.orderId}* delivered! Enjoy your meal! Thank you for choosing FreshCatch 😊`,
    cancelled: `❌ Order *${order.orderId}* cancelled.${order.cancelReason ? ' Reason: ' + order.cancelReason : ''}`,
  }
  const msg = msgs[order.status]
  if (!msg || !order.customerPhone) return
  return sendWhatsAppMessage(order.customerPhone, `🐟 *FreshCatch*\n\n${msg}`)
}

module.exports = {
  sendOTP,
  notifyNewOrder,
  notifyCustomerStatus,
  sendWhatsAppMessage,
}
