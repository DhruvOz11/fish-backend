const https = require('https')

// ── Low-level HTTPS POST ─────────────────────────────────────────
function httpsPost(urlStr, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const u = new URL(urlStr)
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
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
            ok: res.statusCode < 300,
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

// ── HTTPS multipart POST (for media upload) ──────────────────────
function httpsMultipart(urlStr, boundary, bufferBody, authToken) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bufferBody.length,
      },
    }
    const req = https.request(opts, (res) => {
      let raw = ''
      res.on('data', (d) => (raw += d))
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode < 300,
            status: res.statusCode,
            data: JSON.parse(raw),
          })
        } catch {
          resolve({ ok: false, status: res.statusCode, data: raw })
        }
      })
    })
    req.on('error', reject)
    req.write(bufferBody)
    req.end()
  })
}

// ── Send plain text WhatsApp message ─────────────────────────────
async function sendWhatsAppMessage(to, message) {
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN

  if (!pid || !token) {
    console.log(
      '\n[WhatsApp DEV — credentials not set]\nTo:',
      to,
      '\n' + message + '\n',
    )
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
    if (!res.ok) {
      const errMsg = res.data?.error?.message || JSON.stringify(res.data)
      console.error('[WhatsApp] API error:', errMsg)
      throw new Error(errMsg)
    }
    return { success: true }
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.message)
    return { success: false, reason: err.message }
  }
}

// ── Upload media (PDF) to WhatsApp, get media_id ─────────────────
async function uploadWhatsAppMedia(pdfBuffer, filename) {
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!pid || !token) return null

  const boundary = '----FormBoundary' + Date.now()
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="messaging_product"\r\n\r\n`,
    `whatsapp\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="type"\r\n\r\n`,
    `application/pdf\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
    `Content-Type: application/pdf\r\n\r\n`,
  ]

  const headerBuf = Buffer.from(parts.join(''), 'utf8')
  const footerBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const body = Buffer.concat([headerBuf, pdfBuffer, footerBuf])

  const res = await httpsMultipart(
    `https://graph.facebook.com/v19.0/${pid}/media`,
    boundary,
    body,
    token,
  )
  if (!res.ok)
    throw new Error(res.data?.error?.message || 'Media upload failed')
  return res.data.id
}

// ── Send PDF document via WhatsApp ───────────────────────────────
async function sendWhatsAppDocument(to, mediaId, caption, filename) {
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!pid || !token) return { success: false, reason: 'not_configured' }

  const phone = to.replace(/[^0-9]/g, '')
  const res = await httpsPost(
    `https://graph.facebook.com/v19.0/${pid}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: { id: mediaId, caption, filename },
    },
    { Authorization: `Bearer ${token}` },
  )
  if (!res.ok)
    throw new Error(res.data?.error?.message || 'Send document failed')
  return { success: true }
}

// ── Generate PDF invoice buffer ───────────────────────────────────
async function generateInvoicePDF(order) {
  // Try pdfkit if available, fall back to simple text
  try {
    const PDFDocument = require('pdfkit')
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', margin: 40 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const primary = '#1A1A1A'
      const muted = '#666666'
      const accent = '#D9232E'

      // Header
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor(primary)
        .text('The Fish Merchant', { align: 'center' })
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(muted)
        .text('Fresh Seafood Delivered to Your Door', { align: 'center' })
      doc.moveDown(0.5)

      // Red divider
      doc.rect(40, doc.y, doc.page.width - 80, 2).fill(accent)
      doc.moveDown(0.8)

      // Invoice meta
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor(accent)
        .text('INVOICE', { align: 'center' })
      doc.moveDown(0.3)
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(primary)
        .text(`Order ID: ${order.orderId}`, { align: 'center' })
        .text(
          `Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          { align: 'center' },
        )
      doc.moveDown(0.8)

      // Bill to / delivery
      const leftX = 40,
        rightX = 220
      const startY = doc.y
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(muted)
        .text('BILL TO', leftX, startY)
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(primary)
        .text(order.customerName, leftX, doc.y)
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(muted)
        .text(order.customerPhone, leftX)
        .text(
          order.address + (order.landmark ? ', ' + order.landmark : ''),
          leftX,
          doc.y,
          { width: 160 },
        )
        .text('Pincode: ' + order.pincode, leftX)

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(muted)
        .text('DELIVER TO', rightX, startY)
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(primary)
        .text('Payment: ' + order.paymentMethod, rightX, doc.y)
        .text('Status: ' + order.status.toUpperCase(), rightX)

      doc.moveDown(1.5)

      // Items table header
      const tableTop = doc.y
      doc.rect(40, tableTop, doc.page.width - 80, 20).fill('#F3F4F6')
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(primary)
        .text('ITEM', 45, tableTop + 6)
        .text('QTY', 240, tableTop + 6)
        .text('PRICE', 280, tableTop + 6)
        .text('TOTAL', 330, tableTop + 6)

      let rowY = tableTop + 22
      order.items.forEach((item, i) => {
        if (i % 2 === 0)
          doc.rect(40, rowY - 2, doc.page.width - 80, 18).fill('#FAFAFA')
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(primary)
          .text(item.name, 45, rowY, { width: 190 })
          .text(String(item.quantity), 240, rowY)
          .text('₹' + item.price, 280, rowY)
          .text('₹' + item.price * item.quantity, 330, rowY)
        rowY += 20
      })

      doc.moveDown(0.5)
      doc.y = rowY + 6

      // Totals
      const totX = 280
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(muted)
        .text('Item Total:', totX, doc.y)
        .text('₹' + order.itemTotal, 350, doc.y - doc.currentLineHeight())
      doc.moveDown(0.3)
      doc
        .text('Delivery Fee:', totX)
        .text('₹' + order.deliveryFee, 350, doc.y - doc.currentLineHeight())
      if (order.discount > 0) {
        doc.moveDown(0.3)
        doc
          .fillColor('#10B981')
          .text('Discount:', totX)
          .text('-₹' + order.discount, 350, doc.y - doc.currentLineHeight())
      }
      doc.moveDown(0.3)
      doc.rect(totX, doc.y, doc.page.width - totX - 40, 1).fill(primary)
      doc.moveDown(0.4)
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primary)
        .text('TOTAL:', totX)
        .text('₹' + order.totalAmount, 350, doc.y - doc.currentLineHeight(1.2))
      doc.moveDown(1.5)

      // Footer
      doc.rect(40, doc.y, doc.page.width - 80, 1).fill('#E5E7EB')
      doc.moveDown(0.5)
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(muted)
        .text('Thank you for choosing The Fish Merchant!', { align: 'center' })
        .text(
          'For queries, WhatsApp us at +' +
            (process.env.BUSINESS_WHATSAPP || '91XXXXXXXXXX'),
          { align: 'center' },
        )
        .text('🚚 Delivered within 2 hours of confirmation', {
          align: 'center',
        })

      doc.end()
    })
  } catch (e) {
    // pdfkit not installed — return null, fall back to text message
    console.warn('[PDF] pdfkit not available:', e.message)
    return null
  }
}

// ── OTP ──────────────────────────────────────────────────────────
async function sendOTP(phone, otp) {
  return sendWhatsAppMessage(
    phone,
    `🐟 *The Fish Merchant*\n\nYour login OTP is: *${otp}*\n\nValid for 10 minutes. Do not share this with anyone.\n\n_Team The Fish Merchant_`,
  )
}

// ── New order alert to business ──────────────────────────────────
async function notifyNewOrder(order) {
  const biz = process.env.BUSINESS_WHATSAPP
  if (!biz) return
  const items = order.items
    .map((i) => `  • ${i.name} × ${i.quantity} = ₹${i.price * i.quantity}`)
    .join('\n')
  return sendWhatsAppMessage(
    biz,
    `🆕 *New Order — ${order.orderId}*\n\n` +
      `👤 ${order.customerName}\n📞 ${order.customerPhone}\n` +
      `📍 ${order.address}${order.landmark ? ', ' + order.landmark : ''}, ${order.pincode}\n\n` +
      `📦 *Items:*\n${items}\n\n` +
      `💰 Item Total: ₹${order.itemTotal}\n` +
      (order.discount > 0 ? `🎟 Discount: -₹${order.discount}\n` : '') +
      `*Sub-total: ₹${order.itemTotal - order.discount}*\n` +
      `+ Delivery (set when confirming)\n\n` +
      `💵 Payment: ${order.paymentMethod}`,
  )
}

// ── Invoice confirmation to customer (PDF if possible, text fallback) ─
async function sendOrderConfirmation(order) {
  if (!order.customerPhone) return

  const pdfBuffer = await generateInvoicePDF(order)

  if (pdfBuffer) {
    try {
      // Upload PDF to WhatsApp media
      const mediaId = await uploadWhatsAppMedia(
        pdfBuffer,
        `Invoice-${order.orderId}.pdf`,
      )
      if (mediaId) {
        // Send PDF document
        await sendWhatsAppDocument(
          order.customerPhone,
          mediaId,
          `✅ Order Confirmed!\n\nDear ${order.customerName}, your order *${order.orderId}* has been confirmed.\n🚚 Delivery within 2 hours.\n\nPlease find your invoice attached.`,
          `Invoice-${order.orderId}.pdf`,
        )
        // Also send a quick confirmation text after
        await sendWhatsAppMessage(
          order.customerPhone,
          `✅ *Order Confirmed — ${order.orderId}*\n\n` +
            `Your invoice PDF has been sent above ☝️\n\n` +
            `🚚 Delivery within 2 hours.\n💵 Pay: ₹${order.totalAmount} (${order.paymentMethod})\n\n` +
            `Questions? Reply to this message.\n_Team The Fish Merchant_ 🐟`,
        )
        return { success: true, method: 'pdf' }
      }
    } catch (err) {
      console.warn(
        '[WhatsApp] PDF send failed, sending text invoice:',
        err.message,
      )
    }
  }

  // Fallback: detailed text invoice
  const items = order.items
    .map((i) => `  • ${i.name} × ${i.quantity}  →  ₹${i.price * i.quantity}`)
    .join('\n')
  const msg = [
    `🧾 *INVOICE — The Fish Merchant*`,
    `Order ID: *${order.orderId}*`,
    `Date: ${new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ``,
    `📦 *Items Ordered*`,
    items,
    ``,
    `💰 *Bill Summary*`,
    `Item Total:   ₹${order.itemTotal}`,
    `Delivery Fee: ₹${order.deliveryFee}`,
    ...(order.discount > 0 ? [`Discount:     -₹${order.discount}`] : []),
    ``,
    `*Amount to Pay: ₹${order.totalAmount}*`,
    ``,
    `📍 ${order.address}${order.landmark ? ', ' + order.landmark : ''}, ${order.pincode}`,
    ``,
    `✅ Order confirmed! 🚚 Delivery within 2 hours.`,
    `💵 Payment: ${order.paymentMethod}`,
    ``,
    `Thank you for choosing The Fish Merchant! 🐟`,
    `Questions? Reply to this message.`,
  ].join('\n')

  return sendWhatsAppMessage(order.customerPhone, msg)
}

// ── Status updates to customer ───────────────────────────────────
async function notifyCustomerStatus(order) {
  if (order.status === 'confirmed') {
    return sendOrderConfirmation(order)
  }
  const msgs = {
    preparing: `🔪 Your order *${order.orderId}* is being cleaned & packed fresh for you.`,
    out_for_delivery: `🚚 Your order *${order.orderId}* is on the way! Should reach you soon.`,
    delivered: `✅ Order *${order.orderId}* delivered!\n\nEnjoy your meal! 😊\n\nHad an issue? Reply to this message.\n\nThank you for choosing *The Fish Merchant* 🐟`,
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
  generateInvoicePDF,
}
