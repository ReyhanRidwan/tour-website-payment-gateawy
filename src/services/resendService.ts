// ============================================================================
// HOOLA HOLIDAY BALI - RESEND EMAIL & UNIVERSAL NOTIFICATION SERVICE
// Berjalan 100% mulus di Cloudflare Workers / Pages Functions & Node.js Express
// Menggunakan Resend REST API (via fetch) yang tidak membutuhkan dependensi TCP raw SMTP.
// ============================================================================

export interface BookingEmailData {
  orderId: string;
  bookingType: 'tour' | 'rental';
  itemName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmountIDR: number;
  grossAmountPaidIDR: number;
  remainingBalanceIDR: number;
  paymentType: 'dp' | 'full';
  dpPercentage: number;
  status: string;
  paymentMethod?: string;
  startDate?: string;
  deliveryLocation?: string;
  driverOption?: string;
  quantity?: number;
  specialNotes?: string;
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// 1. Template Email E-Voucher Mewah untuk Tamu (Customer)
export function generateCustomerEmailHtml(data: BookingEmailData): string {
  const isDP = data.paymentType === 'dp';
  const statusBadgeColor = isDP ? '#d97706' : '#059669';
  const statusBadgeText = isDP
    ? `DOWN PAYMENT ${data.dpPercentage}% TERVERIFIKASI`
    : 'PEMBAYARAN LUNAS 100% TERVERIFIKASI';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Voucher Resmi Hoola Holiday Bali</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    .header { background: linear-gradient(135deg, #171717 0%, #262626 50%, #0a0a0a 100%); padding: 36px 24px; text-align: center; color: #ffffff; border-bottom: 3px solid #dfab56; }
    .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 3px; margin: 0; color: #dfab56; text-transform: uppercase; }
    .brand-subtitle { font-size: 11px; color: #d4d4d8; margin-top: 6px; letter-spacing: 2px; text-transform: uppercase; font-family: monospace; }
    .badge { display: inline-block; background-color: ${statusBadgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; letter-spacing: 1px; margin-top: 20px; text-transform: uppercase; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .intro-text { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .voucher-card { background: #fafaf9; border: 2px dashed #d6d3d1; border-radius: 12px; padding: 22px; margin-bottom: 24px; }
    .voucher-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #78716c; letter-spacing: 1.5px; margin-bottom: 4px; font-family: monospace; }
    .voucher-code { font-size: 24px; font-weight: 800; color: #b45309; letter-spacing: 1.5px; font-family: monospace; }
    .detail-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    .detail-table td { padding: 10px 0; border-bottom: 1px solid #e7e5e4; font-size: 14px; }
    .detail-label { color: #78716c; width: 42%; font-size: 13px; }
    .detail-value { color: #1c1917; font-weight: 600; text-align: right; }
    .highlight-box { background: ${isDP ? '#fffbeb' : '#f0fdf4'}; border-left: 4px solid ${isDP ? '#d97706' : '#059669'}; padding: 16px 20px; border-radius: 6px; margin: 24px 0; }
    .highlight-title { font-size: 13px; font-weight: 800; color: ${isDP ? '#92400e' : '#065f46'}; letter-spacing: 0.5px; margin-bottom: 6px; }
    .highlight-desc { font-size: 13px; color: ${isDP ? '#78350f' : '#047857'}; line-height: 1.5; margin: 0; }
    .pickup-step { background: #f5f5f4; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px; }
    .step-item { font-size: 13px; color: #44403c; margin-bottom: 8px; line-height: 1.5; }
    .footer { background: #f5f5f4; padding: 22px 24px; text-align: center; border-top: 1px solid #e7e5e4; font-size: 12px; color: #78716c; }
    .contact-link { color: #b45309; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="brand-title">HOOLA HOLIDAY BALI</h1>
      <div class="brand-subtitle">VIP Tour & Luxury Travel Charter Bali</div>
      <div class="badge">${statusBadgeText}</div>
    </div>

    <div class="body">
      <div class="greeting">Om Swastyastu, ${data.customerName}!</div>
      <p class="intro-text">
        Terima kasih telah melakukan reservasi bersama <strong>Hoola Holiday Bali</strong>. 
        Pembayaran Anda melalui gerbang pembayaran <strong>Midtrans</strong> telah berhasil diverifikasi secara resmi.
      </p>

      <div class="voucher-card">
        <div class="voucher-title">KODE RESERVASI / E-VOUCHER</div>
        <div class="voucher-code">${data.orderId}</div>

        <table class="detail-table">
          <tr>
            <td class="detail-label">Paket / Layanan</td>
            <td class="detail-value">${data.itemName}</td>
          </tr>
          ${data.startDate ? `
          <tr>
            <td class="detail-label">Tanggal Pelaksanaan</td>
            <td class="detail-value">${data.startDate}</td>
          </tr>` : ''}
          ${data.quantity ? `
          <tr>
            <td class="detail-label">Jumlah Tamu / Durasi</td>
            <td class="detail-value">${data.quantity} ${data.bookingType === 'rental' ? 'Hari' : 'Orang (Pax)'}</td>
          </tr>` : ''}
          ${data.deliveryLocation ? `
          <tr>
            <td class="detail-label">Lokasi Antar/Jemput</td>
            <td class="detail-value">${data.deliveryLocation}</td>
          </tr>` : ''}
          ${data.driverOption ? `
          <tr>
            <td class="detail-label">Skema Armada</td>
            <td class="detail-value">${data.driverOption === 'with' ? 'Dengan Supir & BBM' : 'Lepas Kunci'}</td>
          </tr>` : ''}
          <tr>
            <td class="detail-label">Metode Pembayaran</td>
            <td class="detail-value">${data.paymentMethod || 'Midtrans Snap Gateway'}</td>
          </tr>
          <tr>
            <td class="detail-label">Total Nilai Paket</td>
            <td class="detail-value">${formatIDR(data.totalAmountIDR)}</td>
          </tr>
          <tr>
            <td class="detail-label">Nominal Terbayar (Midtrans)</td>
            <td class="detail-value" style="color: #059669; font-size: 15px;">${formatIDR(data.grossAmountPaidIDR)}</td>
          </tr>
          ${isDP ? `
          <tr>
            <td class="detail-label" style="color: #d97706; font-weight: 700;">Sisa Pelunasan di Bali</td>
            <td class="detail-value" style="color: #d97706; font-size: 15px; font-weight: 800;">${formatIDR(data.remainingBalanceIDR)}</td>
          </tr>` : ''}
        </table>
      </div>

      <div class="highlight-box">
        <div class="highlight-title">📍 INFORMASI PENJEMPUTAN RESMI</div>
        <p class="highlight-desc">
          Tim Concierge Hoola Holiday Bali akan menghubungi WhatsApp Anda di nomor <strong>${data.customerPhone}</strong> 
          H-1 sebelum jadwal tur untuk konfirmasi jam penjemputan, plat nomor armada pribadi, serta nama supir VIP Anda.
        </p>
      </div>

      <div class="pickup-step">
        <div style="font-weight: 700; color: #1c1917; font-size: 13px; margin-bottom: 8px;">Panduan Perjalanan:</div>
        <div class="step-item">✓ Simpan atau screenshot email E-Voucher ini sebagai bukti sah reservasi Anda.</div>
        <div class="step-item">✓ Armada pribadi ber-AC dan supir berlisensi pariwisata Bali sudah siap melayani Anda.</div>
        ${isDP ? `<div class="step-item">✓ <strong>Sisa pelunasan sebesar ${formatIDR(data.remainingBalanceIDR)}</strong> dapat diserahkan saat penjemputan (tunai Cash atau transfer).</div>` : ''}
      </div>
    </div>

    <div class="footer">
      <div><strong>Hoola Holiday Bali</strong> • Jl. Sunset Road No. 88, Kuta, Badung, Bali 80361</div>
      <div style="margin-top: 4px;">WhatsApp Concierge: <a class="contact-link" href="https://wa.me/628123456789">+62 812-3456-789</a></div>
      <div style="margin-top: 10px; font-size: 11px; color: #a8a29e;">Konfirmasi diterbitkan otomatis oleh Cloudflare & Midtrans Payment Gateway.</div>
    </div>
  </div>
</body>
</html>`;
}

// 2. Template Email Notifikasi untuk Admin Hoola Holiday
export function generateAdminEmailHtml(data: BookingEmailData): string {
  const isDP = data.paymentType === 'dp';
  const cleanPhone = data.customerPhone.replace(/\D/g, '');
  const waUrl = cleanPhone.startsWith('0')
    ? `https://wa.me/62${cleanPhone.slice(1)}`
    : `https://wa.me/${cleanPhone}`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Orderan Baru Midtrans - Hoola Holiday Bali</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dfab56; }
    .header { background: #171717; color: #ffffff; padding: 20px 24px; border-bottom: 2px solid #dfab56; }
    .title { margin: 0; font-size: 20px; font-weight: 800; color: #dfab56; }
    .body { padding: 24px; }
    .wa-button { display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; margin: 16px 0; font-size: 14px; text-align: center; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    .data-table td { padding: 9px 12px; border: 1px solid #e2e8f0; font-size: 13px; }
    .label { background: #f8fafc; font-weight: 700; width: 35%; color: #475569; }
    .value { font-weight: 600; color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa; font-family: monospace;">Hoola Holiday Bali Admin Alert</div>
      <h2 class="title">🔔 ORDERAN BARU MASUK (${isDP ? 'DP 30%' : 'LUNAS 100%'})</h2>
    </div>

    <div class="body">
      <p style="font-size: 14px; color: #334155; margin-top: 0;">
        Ada reservasi baru yang telah berhasil membayar via <strong>Midtrans (${data.paymentMethod || 'Online Payment'})</strong>.
        Segera hubungi tamu untuk konfirmasi penjemputan:
      </p>

      <div style="text-align: center;">
        <a class="wa-button" href="${waUrl}" target="_blank">
          💬 Chat WhatsApp Tamu Sekarang (${data.customerPhone})
        </a>
      </div>

      <table class="data-table">
        <tr>
          <td class="label">Order ID</td>
          <td class="value" style="font-family: monospace; font-size: 14px; color: #b45309;">${data.orderId}</td>
        </tr>
        <tr>
          <td class="label">Nama Tamu</td>
          <td class="value">${data.customerName}</td>
        </tr>
        <tr>
          <td class="label">WhatsApp Tamu</td>
          <td class="value">${data.customerPhone}</td>
        </tr>
        <tr>
          <td class="label">Email Tamu</td>
          <td class="value">${data.customerEmail}</td>
        </tr>
        <tr>
          <td class="label">Paket / Layanan</td>
          <td class="value">${data.itemName}</td>
        </tr>
        ${data.startDate ? `
        <tr>
          <td class="label">Tanggal Trip</td>
          <td class="value">${data.startDate}</td>
        </tr>` : ''}
        ${data.quantity ? `
        <tr>
          <td class="label">Jumlah Pax</td>
          <td class="value">${data.quantity} Orang</td>
        </tr>` : ''}
        <tr>
          <td class="label">Status Pembayaran</td>
          <td class="value" style="color: #16a34a; font-weight: 800;">${isDP ? `DP ${data.dpPercentage}% (SUKSES)` : 'LUNAS (SUKSES)'}</td>
        </tr>
        <tr>
          <td class="label">Nominal Masuk (Midtrans)</td>
          <td class="value" style="color: #16a34a; font-weight: 800;">${formatIDR(data.grossAmountPaidIDR)}</td>
        </tr>
        ${isDP ? `
        <tr>
          <td class="label">Sisa Pelunasan Tamu</td>
          <td class="value" style="color: #d97706; font-weight: 800;">${formatIDR(data.remainingBalanceIDR)} (Tagih saat serah terima)</td>
        </tr>` : ''}
        ${data.specialNotes ? `
        <tr>
          <td class="label">Catatan Tamu</td>
          <td class="value">${data.specialNotes}</td>
        </tr>` : ''}
      </table>
    </div>
  </div>
</body>
</html>`;
}

// 3. Mengirim email via Resend API (HTTP REST fetch)
export async function sendEmailViaResendApi(params: {
  apiKey: string;
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  const from = params.from || 'Hoola Holiday Bali <onboarding@resend.dev>';
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: params.subject,
      html: params.html,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(data.message || data.error?.message || `Resend API HTTP ${res.status}`);
  }

  return data;
}

// 4. Dispatcher Utama Universal (Resend API dengan fallback ke SMTP jika di Node)
export async function dispatchBookingEmails(
  data: BookingEmailData,
  env?: {
    RESEND_API_KEY?: string;
    RESEND_FROM?: string;
    ADMIN_EMAIL?: string;
    SMTP_USER?: string;
    SMTP_PASS?: string;
  }
): Promise<{
  success: boolean;
  provider: 'resend' | 'smtp' | 'simulated';
  customerSent: boolean;
  adminSent: boolean;
  message: string;
}> {
  const resendApiKey = env?.RESEND_API_KEY || (typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : '');
  const resendFrom = env?.RESEND_FROM || (typeof process !== 'undefined' ? process.env?.RESEND_FROM : '') || 'Hoola Holiday Bali <booking@balinikitour.biz.id>';
  const adminEmail = env?.ADMIN_EMAIL || (typeof process !== 'undefined' ? process.env?.ADMIN_EMAIL : '') || 'reyhanridwan30@gmail.com';

  // JIKA RESEND API KEY TERSEDIA (METODE RESEND DI CLOUDFLARE WORKERS / NODE)
  if (resendApiKey && resendApiKey.startsWith('re_')) {
    let customerSent = false;
    let adminSent = false;

    // A. Kirim E-Voucher ke Tamu (Hanya jika email tamu valid dan terisi)
    if (data.customerEmail && data.customerEmail.includes('@')) {
      try {
        await sendEmailViaResendApi({
          apiKey: resendApiKey,
          from: resendFrom,
          to: data.customerEmail,
          subject: `E-Voucher Resmi Reservasi [${data.orderId}] - Hoola Holiday Bali`,
          html: generateCustomerEmailHtml(data),
        });
        customerSent = true;
        console.log(`[Resend API] Berhasil mengirim E-Voucher ke tamu: ${data.customerEmail}`);
      } catch (err: any) {
        console.error(`[Resend API Error Tamu]: ${err.message}`);
      }
    } else {
      console.warn(`[Resend API] Email tamu tidak valid (${data.customerEmail}), lewati kirim voucher ke tamu.`);
    }

    // B. Kirim Notifikasi Pesanan Baru ke Admin (Hanya ke adminEmail)
    if (adminEmail && adminEmail.includes('@')) {
      try {
        await sendEmailViaResendApi({
          apiKey: resendApiKey,
          from: resendFrom,
          to: adminEmail,
          subject: `🔔 BOOKING BARU [${data.orderId}] - ${data.customerName} (${data.itemName})`,
          html: generateAdminEmailHtml(data),
        });
        adminSent = true;
        console.log(`[Resend API] Berhasil mengirim notifikasi order ke admin: ${adminEmail}`);
      } catch (err: any) {
        console.error(`[Resend API Error Admin]: ${err.message}`);
      }
    }

    return {
      success: customerSent || adminSent,
      provider: 'resend',
      customerSent,
      adminSent,
      message: customerSent && adminSent
        ? 'Email berhasil dikirim via Resend API.'
        : 'Salah satu email berhasil dikirim via Resend API.',
    };
  }

  // JIKA TIDAK ADA RESEND API KEY, CEK APAKAH ADA SMTP DI NODE.JS
  const smtpUser = env?.SMTP_USER || (typeof process !== 'undefined' ? process.env?.SMTP_USER : '');
  const smtpPass = env?.SMTP_PASS || (typeof process !== 'undefined' ? process.env?.SMTP_PASS : '');

  if (typeof process !== 'undefined' && smtpUser && smtpPass && !smtpPass.includes('xxxx')) {
    try {
      // Dynamic import nodemailer hanya saat di Node.js agar tidak merusak Cloudflare Workers
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass.replace(/\s+/g, '').trim(),
        },
      });

      let customerSent = false;
      let adminSent = false;

      try {
        await transporter.sendMail({
          from: `"Hoola Holiday Bali" <${smtpUser}>`,
          to: data.customerEmail,
          subject: `E-Voucher Resmi Reservasi [${data.orderId}] - Hoola Holiday Bali`,
          html: generateCustomerEmailHtml(data),
        });
        customerSent = true;
      } catch (err: any) {
        console.error(`[SMTP Error Tamu]: ${err.message}`);
      }

      try {
        await transporter.sendMail({
          from: `"Hoola Holiday Notifikasi" <${smtpUser}>`,
          to: adminEmail,
          subject: `🔔 BOOKING BARU [${data.orderId}] - ${data.customerName} (${data.itemName})`,
          html: generateAdminEmailHtml(data),
        });
        adminSent = true;
      } catch (err: any) {
        console.error(`[SMTP Error Admin]: ${err.message}`);
      }

      return {
        success: customerSent || adminSent,
        provider: 'smtp',
        customerSent,
        adminSent,
        message: 'Email dikirim via Gmail SMTP Node.js.',
      };
    } catch (e: any) {
      console.warn(`[Nodemailer fallback not available]: ${e.message}`);
    }
  }

  // SIMULASI JIKA BELUM ADA KUNCI
  console.log(`[SIMULASI EMAIL] Order ${data.orderId} - Resend API Key belum diset di Cloudflare Pages / .env.`);
  return {
    success: true,
    provider: 'simulated',
    customerSent: false,
    adminSent: false,
    message: 'Mode simulasi email aktif: Tambahkan RESEND_API_KEY di pengaturan Cloudflare Pages Environment Variables.',
  };
}
