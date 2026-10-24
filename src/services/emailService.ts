import nodemailer from 'nodemailer';

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

// Format Rupiah helper
function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Konfigurasi transporter SMTP
function createSmtpTransporter() {
  // Ambil dari environment variable atau gunakan kredensial resmi yang dikonfigurasikan
  const user = (process.env.SMTP_USER || 'nusawebworks@gmail.com').trim();
  const rawPass = process.env.SMTP_PASS || 'jvek umzm ovgg tnok';
  // Buang semua spasi dari Google App Password 16 karakter
  const pass = rawPass.replace(/\s+/g, '').trim();

  // Validasi apakah konfigurasi SMTP Gmail sudah diisi
  const isSmtpConfigured = Boolean(
    user &&
    pass &&
    !user.includes('YOUR_') &&
    !pass.includes('YOUR_') &&
    user.includes('@')
  );

  if (!isSmtpConfigured) {
    return { transporter: null, isConfigured: false, user };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });

  return { transporter, isConfigured: true, user };
}

// 1. Template Email E-Voucher Resmi untuk Tamu (Customer)
function generateCustomerEmailHtml(data: BookingEmailData): string {
  const isDP = data.paymentType === 'dp';
  const statusBadgeColor = isDP ? '#d97706' : '#059669';
  const statusBadgeText = isDP
    ? `DOWN PAYMENT ${data.dpPercentage}% TERVERIFIKASI`
    : 'PEMBAYARAN LUNAS 100% TERVERIFIKASI';

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Voucher Resmi Hoola Holiday Bali</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
    .header { background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f172a 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 2px; margin: 0; color: #fbbf24; text-transform: uppercase; }
    .brand-subtitle { font-size: 13px; color: #d1fae5; margin-top: 6px; letter-spacing: 1px; }
    .badge { display: inline-block; background-color: ${statusBadgeColor}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; letter-spacing: 0.5px; margin-top: 18px; text-transform: uppercase; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .intro-text { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .voucher-card { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .voucher-title { font-size: 12px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 1px; margin-bottom: 4px; }
    .voucher-code { font-size: 24px; font-weight: 800; color: #047857; letter-spacing: 1.5px; font-family: monospace; }
    .detail-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .detail-table td { padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .detail-label { color: #64748b; width: 40%; }
    .detail-value { color: #0f172a; font-weight: 600; text-align: right; }
    .highlight-box { background: ${isDP ? '#fffbeb' : '#f0fdf4'}; border-left: 4px solid ${isDP ? '#f59e0b' : '#10b981'}; padding: 16px; border-radius: 6px; margin: 24px 0; }
    .highlight-title { font-size: 14px; font-weight: 700; color: ${isDP ? '#92400e' : '#065f46'}; margin-bottom: 6px; }
    .highlight-desc { font-size: 13px; color: ${isDP ? '#78350f' : '#047857'}; line-height: 1.5; margin: 0; }
    .pickup-step { background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .step-item { font-size: 13px; color: #334155; margin-bottom: 8px; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    .contact-link { color: #047857; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="brand-title">HOOLA HOLIDAY BALI</h1>
      <div class="brand-subtitle">Luxury Tour & Premium Car Rental Bali</div>
      <div class="badge">${statusBadgeText}</div>
    </div>

    <div class="body">
      <div class="greeting">Om Swastyastu, Bapak/Ibu ${data.customerName}!</div>
      <p class="intro-text">
        Terima kasih telah mempercayakan perjalanan liburan Anda di Pulau Dewata kepada <strong>Hoola Holiday Bali</strong>. 
        Pembayaran Anda melalui gerbang pembayaran <strong>Midtrans</strong> telah kami terima dan diverifikasi secara resmi.
      </p>

      <div class="voucher-card">
        <div class="voucher-title">Kode Booking / E-Voucher</div>
        <div class="voucher-code">${data.orderId}</div>

        <table class="detail-table">
          <tr>
            <td class="detail-label">Layanan / Item</td>
            <td class="detail-value">${data.itemName}</td>
          </tr>
          ${data.startDate ? `
          <tr>
            <td class="detail-label">Tanggal Pemakaian</td>
            <td class="detail-value">${data.startDate}</td>
          </tr>` : ''}
          ${data.deliveryLocation ? `
          <tr>
            <td class="detail-label">Lokasi Antar/Jemput</td>
            <td class="detail-value">${data.deliveryLocation}</td>
          </tr>` : ''}
          ${data.driverOption ? `
          <tr>
            <td class="detail-label">Pilihan Supir</td>
            <td class="detail-value">${data.driverOption === 'with' ? 'Dengan Supir & BBM' : 'Lepas Kunci'}</td>
          </tr>` : ''}
          <tr>
            <td class="detail-label">Total Biaya</td>
            <td class="detail-value">${formatIDR(data.totalAmountIDR)}</td>
          </tr>
          <tr>
            <td class="detail-label">Jumlah Dibayar (DP/Lunas)</td>
            <td class="detail-value" style="color: #047857; font-size: 15px;">${formatIDR(data.grossAmountPaidIDR)}</td>
          </tr>
          ${isDP ? `
          <tr>
            <td class="detail-label" style="color: #d97706; font-weight: 700;">Sisa Pelunasan di Lokasi</td>
            <td class="detail-value" style="color: #d97706; font-size: 15px; font-weight: 800;">${formatIDR(data.remainingBalanceIDR)}</td>
          </tr>` : ''}
        </table>
      </div>

      <div class="highlight-box">
        <div class="highlight-title">📍 LANGKAH SELANJUTNYA & PENJEMPUTAN</div>
        <p class="highlight-desc">
          Tim operasional Hoola Holiday Bali akan segera menghubungi Anda melalui nomor WhatsApp <strong>${data.customerPhone}</strong> 
          untuk konfirmasi jam kedatangan, nomor penerbangan di Bandara Ngurah Rai, serta detail plat nomor kendaraan/driver kami.
        </p>
      </div>

      <div class="pickup-step">
        <div style="font-weight: 700; color: #0f172a; font-size: 13px; margin-bottom: 8px;">Tips Penjemputan di Bali:</div>
        <div class="step-item">✓ Simpan atau screenshot email E-Voucher ini sebagai bukti resmi reservasi.</div>
        <div class="step-item">✓ Tim driver kami akan menunggu di Gate Kedatangan dengan papan nama bertuliskan <strong>"${data.customerName}"</strong>.</div>
        <div class="step-item">✓ Butuh bantuan mendadak? Hubungi hotline operasional 24/7 kami via WhatsApp.</div>
      </div>
    </div>

    <div class="footer">
      <div>Hoola Holiday Bali • Jl. Sunset Road No. 88, Kuta, Badung, Bali</div>
      <div style="margin-top: 4px;">WhatsApp Hotline: <a class="contact-link" href="https://wa.me/628123456789">+62 812-3456-789</a></div>
      <div style="margin-top: 12px; font-size: 11px; color: #94a3b8;">Email konfirmasi otomatis oleh sistem Hoola Holiday Bali & Midtrans Secure Gateway.</div>
    </div>
  </div>
</body>
</html>
`;
}

// 2. Template Email Notifikasi untuk Tim Operasional Hoola Holiday (Admin)
function generateAdminEmailHtml(data: BookingEmailData): string {
  const isDP = data.paymentType === 'dp';
  const customerPhone = data.customerPhone || '-';
  const customerName = data.customerName || 'Tamu Terhormat';
  const customerEmail = data.customerEmail || '-';
  const itemName = data.itemName || 'Paket Wisata Hoola Holiday Bali';
  const cleanPhone = customerPhone.replace(/\D/g, '');
  const waUrl = cleanPhone
    ? (cleanPhone.startsWith('0') ? `https://wa.me/62${cleanPhone.slice(1)}` : `https://wa.me/${cleanPhone}`)
    : '#';

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Notifikasi Booking Masuk - Hoola Holiday Bali</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0f172a; color: #ffffff; padding: 20px; text-align: left; }
    .title { margin: 0; font-size: 20px; font-weight: 800; color: #38bdf8; }
    .body { padding: 24px; }
    .wa-button { display: inline-block; background: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; margin: 16px 0; font-size: 14px; text-align: center; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .data-table td { padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; }
    .label { background: #f8fafc; font-weight: 700; width: 35%; color: #475569; }
    .value { font-weight: 600; color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">Hoola Holiday Bali Admin Alert</div>
      <h2 class="title">🔔 ORDERAN BARU DITERIMA (${isDP ? 'DP 30%' : 'LUNAS 100%'})</h2>
    </div>

    <div class="body">
      <p style="font-size: 14px; color: #334155; margin-top: 0;">
        Ada reservasi baru yang telah berhasil membayar melalui <strong>Midtrans (${data.paymentMethod || 'Online Payment'})</strong>.
        Segera hubungi tamu untuk konfirmasi penjemputan/pengantaran armada.
      </p>

      <div style="text-align: center;">
        <a class="wa-button" href="${waUrl}" target="_blank">
          💬 Chat WhatsApp Tamu Sekarang (${data.customerPhone})
        </a>
      </div>

      <table class="data-table">
        <tr>
          <td class="label">Kode Reservasi</td>
          <td class="value" style="font-family: monospace; font-size: 15px; color: #0284c7;">${data.orderId}</td>
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
          <td class="label">Layanan / Armada</td>
          <td class="value">${data.itemName}</td>
        </tr>
        ${data.startDate ? `
        <tr>
          <td class="label">Tanggal Pakai</td>
          <td class="value">${data.startDate}</td>
        </tr>` : ''}
        ${data.deliveryLocation ? `
        <tr>
          <td class="label">Lokasi Antar/Jemput</td>
          <td class="value">${data.deliveryLocation}</td>
        </tr>` : ''}
        ${data.driverOption ? `
        <tr>
          <td class="label">Opsi Supir</td>
          <td class="value">${data.driverOption === 'with' ? 'Dengan Supir' : 'Lepas Kunci'}</td>
        </tr>` : ''}
        <tr>
          <td class="label">Status Pembayaran</td>
          <td class="value" style="color: #059669; font-weight: 800;">${isDP ? `DP ${data.dpPercentage}% (SUKSES)` : 'LUNAS (SUKSES)'}</td>
        </tr>
        <tr>
          <td class="label">Nominal Masuk (Midtrans)</td>
          <td class="value" style="color: #059669; font-weight: 800;">${formatIDR(data.grossAmountPaidIDR)}</td>
        </tr>
        ${isDP ? `
        <tr>
          <td class="label">Sisa Pelunasan Tamu</td>
          <td class="value" style="color: #d97706; font-weight: 800;">${formatIDR(data.remainingBalanceIDR)} (Tagih saat serah terima/tiba di Bali)</td>
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
</html>
`;
}

// 3. Eksekusi Pengiriman Email Ganda (Customer + Admin)
export async function sendBookingConfirmationEmails(data: BookingEmailData): Promise<{
  success: boolean;
  customerSent: boolean;
  adminSent: boolean;
  isSimulated: boolean;
  message: string;
}> {
  const { transporter, isConfigured, user } = createSmtpTransporter();
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'nusawebworks@gmail.com';

  // Jika SMTP belum dikonfigurasi, jalankan mode simulasi & log rapi di console
  if (!isConfigured || !transporter) {
    console.log(`[SMTP SIMULATION] Transaksi ${data.orderId} sukses!`);
    console.log(`[SMTP SIMULATION] Email E-Voucher disiapkan untuk Tamu: ${data.customerEmail} (${data.customerName})`);
    console.log(`[SMTP SIMULATION] Email Notifikasi disiapkan untuk Admin: ${adminEmail}`);
    console.log(`[SMTP INFO] Tambahkan SMTP_USER & SMTP_PASS (Google App Password) di .env untuk mengirim email asli.`);

    return {
      success: true,
      customerSent: false,
      adminSent: false,
      isSimulated: true,
      message: 'Mode simulasi email aktif: Kredensial SMTP_USER & SMTP_PASS belum diset di server.',
    };
  }

  let customerSent = false;
  let adminSent = false;

  try {
    // A. Kirim ke Tamu (Customer)
    const customerMailOptions = {
      from: `"Hoola Holiday Bali" <${user}>`,
      to: data.customerEmail,
      subject: `E-Voucher Resmi Reservasi [${data.orderId}] - Hoola Holiday Bali`,
      html: generateCustomerEmailHtml(data),
    };

    await transporter.sendMail(customerMailOptions);
    customerSent = true;
    console.log(`[SMTP] Sukses mengirim E-Voucher ke tamu: ${data.customerEmail}`);
  } catch (custErr: any) {
    console.error(`[SMTP ERROR] Gagal mengirim email ke tamu (${data.customerEmail}):`, custErr.message);
  }

  try {
    // B. Kirim ke Admin Hoola Holiday
    const adminMailOptions = {
      from: `"Hoola Holiday Notifikasi" <${user}>`,
      to: adminEmail,
      subject: `🔔 BOOKING BARU [${data.orderId}] - ${data.customerName} (${data.itemName})`,
      html: generateAdminEmailHtml(data),
    };

    await transporter.sendMail(adminMailOptions);
    adminSent = true;
    console.log(`[SMTP] Sukses mengirim notifikasi pesanan ke admin: ${adminEmail}`);
  } catch (adminErr: any) {
    console.error(`[SMTP ERROR] Gagal mengirim email ke admin (${adminEmail}):`, adminErr.message);
  }

  return {
    success: customerSent || adminSent,
    customerSent,
    adminSent,
    isSimulated: false,
    message: customerSent && adminSent
      ? 'Kedua email (Tamu & Admin) berhasil dikirim.'
      : 'Salah satu email berhasil dikirim.',
  };
}
