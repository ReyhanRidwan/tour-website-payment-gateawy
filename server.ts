import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware to parse incoming JSON payloads
app.use(express.json());

// ============================================================================
// 1. SECURE SERVER-SIDE PRICING ENGINE (ANTI-TAMPERING & ANTI-HACKER)
// ============================================================================
// Penting: Nominal harga TIDAK BOLEH dipercaya dari request browser frontend.
// Semua perhitungan total harga dan DP wajib dihitung ulang di server backend.
const USD_TO_IDR_RATE = 16000;

// Sumber harga resmi tur wisata (dalam USD)
const OFFICIAL_TOUR_PRICES: Record<string, { title: string; priceUSD: number }> = {
  'nusa-penida': { title: 'Nusa Penida Golden Beach', priceUSD: 195 },
  'ocean-escape': { title: 'Ocean Luxury Escape', priceUSD: 290 },
  'bali-volcano': { title: 'Mount Batur Sunrise Trek', priceUSD: 145 },
  'atv-jungle': { title: 'ATV Jungle Mud Ride', priceUSD: 110 },
  'river-tubing': { title: 'River Tubing Adventure', priceUSD: 95 },
  'bali-swing': { title: 'Ubud Jungle Swing & Bird Nest', priceUSD: 85 },
  'bedugul-tour': { title: 'Bedugul & Beratan Temple Tour', priceUSD: 135 },
  'lempuyang': { title: 'Lempuyang Gate of Heaven Tour', priceUSD: 140 },
  'uluwatu': { title: 'Uluwatu Sunset & Kecak Dance', priceUSD: 130 },
  'jungle-retreat': { title: 'Serene Jungle Retreat Ubud', priceUSD: 175 },
  'jeep-adventure': { title: 'Sewa Mobil Kijang Innova', priceUSD: 50 },
};

// Sumber harga resmi upgrade / addons (dalam USD)
const OFFICIAL_ADDON_PRICES: Record<string, number> = {
  'photo-pro': 120,
  'drone-4k': 180,
  'champagne': 250,
  'heli-transfer': 450,
};

// Sumber harga resmi rental kendaraan (dalam Rupiah per hari)
const OFFICIAL_VEHICLE_PRICES: Record<string, { name: string; withDriver: number; withoutDriver: number }> = {
  'toyota-avanza': { name: 'New Avanza', withDriver: 450000, withoutDriver: 300000 },
  'toyota-innova': { name: 'Innova Reborn', withDriver: 600000, withoutDriver: 450000 },
  'innova-zenix': { name: 'Innova Zenix Type Q', withDriver: 1200000, withoutDriver: 1200000 },
  'toyota-alphard': { name: 'Toyota Alphard', withDriver: 2500000, withoutDriver: 2500000 },
  'hiace-commuter': { name: 'Hiace Commuter', withDriver: 1000000, withoutDriver: 1000000 },
  'bus-29': { name: 'Bus 29 Seat', withDriver: 2000000, withoutDriver: 2000000 },
  'honda-brio': { name: 'Honda Brio Satya RS', withDriver: 550000, withoutDriver: 350000 },
  'yamaha-nmax': { name: 'Yamaha NMAX 155 Connected', withDriver: 250000, withoutDriver: 150000 },
  'honda-scoopy': { name: 'Honda Scoopy Prestige', withDriver: 195000, withoutDriver: 95000 },
};

import { sendBookingConfirmationEmails } from './src/services/emailService';

// In-Memory Secure Transaction Storage (Bisa dikembangkan ke PostgreSQL / Cloud SQL / Firestore)
interface TransactionRecord {
  orderId: string;
  bookingType: 'tour' | 'rental';
  itemId: string;
  itemName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmountIDR: number;
  totalAmountUSD: number;
  paymentType: 'dp' | 'full';
  dpPercentage: number;
  grossAmountPaidIDR: number;
  remainingBalanceIDR: number;
  status: 'PENDING' | 'DP_PAID' | 'SETTLEMENT' | 'CANCELLED' | 'EXPIRED' | 'DENIED' | 'REFUNDED';
  snapToken?: string;
  redirectUrl?: string;
  isSimulation: boolean;
  paymentMethod?: string;
  startDate?: string;
  deliveryLocation?: string;
  driverOption?: string;
  specialNotes?: string;
  quantity?: number;
  emailSent?: boolean;
  midtransTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

const transactionsDb = new Map<string, TransactionRecord>();

// ============================================================================
// 2. MIDTRANS HELPERS
// ============================================================================
function getMidtransConfig() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const clientKey = (process.env.MIDTRANS_CLIENT_KEY || '').trim();
  const merchantId = (process.env.MIDTRANS_MERCHANT_ID || '').trim();
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  // Cek apakah server key valid dan bukan placeholder kosong
  const isConfigured = Boolean(
    serverKey &&
    !serverKey.includes('YOUR_') &&
    !serverKey.includes('xxxx') &&
    serverKey.length > 10
  );

  const snapBaseUrl = isProduction
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  const coreApiBaseUrl = isProduction
    ? 'https://api.midtrans.com/v2'
    : 'https://api.sandbox.midtrans.com/v2';

  const snapJsUrl = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  return {
    serverKey,
    clientKey,
    merchantId,
    isProduction,
    isConfigured,
    snapBaseUrl,
    coreApiBaseUrl,
    snapJsUrl,
  };
}

// ============================================================================
// 3. API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  const { isConfigured, isProduction, merchantId } = getMidtransConfig();
  res.json({
    status: 'ok',
    service: 'Hoola Holiday Bali - Midtrans Payment Backend',
    midtrans: {
      configured: isConfigured,
      environment: isProduction ? 'production' : 'sandbox',
      merchantId: merchantId || 'not_set',
    },
    timestamp: new Date().toISOString(),
  });
});

// Endpoint konfigurasi publik untuk frontend (HANYA Client Key & Public URL yang dibagikan, Server Key TETAP AMAN di backend)
app.get('/api/payment/config', (req: Request, res: Response) => {
  const { clientKey, merchantId, isProduction, isConfigured, snapJsUrl } = getMidtransConfig();
  res.json({
    clientKey: clientKey || (isProduction ? '' : 'SB-Mid-client-demoKey123'),
    merchantId: merchantId || '',
    isProduction,
    isConfigured,
    snapJsUrl,
    defaultDpPercentage: 30, // Standar DP 30%
    usdToIdrRate: USD_TO_IDR_RATE,
  });
});

// Endpoint untuk membuat transaksi Midtrans Snap & Kalkulasi Nominal DP yang Aman
app.post('/api/payment/create-transaction', async (req: Request, res: Response) => {
  try {
    const {
      bookingType = 'tour',
      itemId,
      quantity = 1, // Jumlah orang (tour) atau hari (rental)
      addons = [],
      driverOption = 'with',
      customer,
      paymentType = 'dp', // 'dp' (30%) atau 'full' (100%)
      dpPercentage = 30,
    } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId (ID Paket / Kendaraan) wajib diisi.' });
    }

    if (!customer?.name || !customer?.email || !customer?.phone) {
      return res.status(400).json({ error: 'Data pemesan (Nama, Email, WhatsApp) wajib diisi lengkap.' });
    }

    // HITUNG ULANG HARGA SECARA RESMI DI SERVER (Anti manipulasi inspect element)
    let itemName = '';
    let officialTotalUSD = 0;
    let officialTotalIDR = 0;

    if (bookingType === 'rental') {
      const vehicle = OFFICIAL_VEHICLE_PRICES[itemId];
      if (!vehicle) {
        return res.status(404).json({ error: `Kendaraan dengan id '${itemId}' tidak ditemukan.` });
      }
      itemName = vehicle.name;
      const ratePerDay = driverOption === 'with' ? vehicle.withDriver : vehicle.withoutDriver;
      const subtotalIDR = ratePerDay * Math.max(1, Number(quantity));
      const taxIDR = Math.round(subtotalIDR * 0.1); // Pajak 10%
      officialTotalIDR = subtotalIDR + taxIDR;
      officialTotalUSD = Math.round(officialTotalIDR / USD_TO_IDR_RATE);
    } else {
      // Default: Paket Tour
      const tour = OFFICIAL_TOUR_PRICES[itemId] || { title: 'Private Tour Bali', priceUSD: 150 };
      itemName = tour.title;
      const baseUSD = tour.priceUSD * Math.max(1, Number(quantity));
      
      let addonUSD = 0;
      if (Array.isArray(addons)) {
        for (const addonId of addons) {
          if (OFFICIAL_ADDON_PRICES[addonId]) {
            addonUSD += OFFICIAL_ADDON_PRICES[addonId];
          }
        }
      }

      const subtotalUSD = baseUSD + addonUSD;
      const taxUSD = Math.round(subtotalUSD * 0.1); // Pajak 10%
      officialTotalUSD = subtotalUSD + taxUSD;
      officialTotalIDR = officialTotalUSD * USD_TO_IDR_RATE;
    }

    // HITUNG NOMINAL DP vs PELUNASAN
    const effectiveDpPercent = Math.min(100, Math.max(10, Number(dpPercentage) || 30));
    let grossAmountIDR = officialTotalIDR;
    let remainingBalanceIDR = 0;

    if (paymentType === 'dp') {
      grossAmountIDR = Math.round((officialTotalIDR * effectiveDpPercent) / 100);
      remainingBalanceIDR = officialTotalIDR - grossAmountIDR;
    }

    // Generate Order ID Unik (Contoh: HHB-DP-1718293-4819)
    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const prefix = paymentType === 'dp' ? 'HHB-DP' : 'HHB-FULL';
    const orderId = `${prefix}-${timestamp}-${randomSuffix}`;

    const { serverKey, isConfigured, snapBaseUrl } = getMidtransConfig();

    let snapToken = '';
    let redirectUrl = '';
    let isSimulation = false;

    if (isConfigured) {
      // 1. Panggil Midtrans Snap API menggunakan SERVER_KEY yang aman di backend
      const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

      const midtransPayload = {
        transaction_details: {
          order_id: orderId,
          gross_amount: grossAmountIDR,
        },
        item_details: [
          {
            id: itemId,
            price: grossAmountIDR,
            quantity: 1,
            name: (paymentType === 'dp'
              ? `DP ${effectiveDpPercent}% - ${itemName}`
              : `Lunas - ${itemName}`
            ).slice(0, 50),
          },
        ],
        customer_details: {
          first_name: customer.name.slice(0, 50),
          email: customer.email,
          phone: customer.phone,
        },
        credit_card: {
          secure: true,
        },
        callbacks: {
          finish: `/?order_id=${orderId}&payment_status=finish`,
        },
      };

      const midtransRes = await fetch(snapBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(midtransPayload),
      });

      const midtransData = (await midtransRes.json()) as any;

      if (!midtransRes.ok || !midtransData.token) {
        console.error('Midtrans API Error:', midtransData);
        throw new Error(midtransData.error_messages?.join(', ') || 'Gagal membuat sesi pembayaran Midtrans.');
      }

      snapToken = midtransData.token;
      redirectUrl = midtransData.redirect_url;
    } else {
      // 2. Mode Simulasi Pengujian Otomatis (Jika pengguna belum memasukkan MIDTRANS_SERVER_KEY di .env)
      // Ini membuat aplikasi tetap dapat dicoba secara interaktif tanpa error crash.
      isSimulation = true;
      snapToken = `simulated-snap-${orderId}`;
      redirectUrl = `/?simulated_order=${orderId}`;
    }

    // Simpan data transaksi ke database backend
    const record: TransactionRecord = {
      orderId,
      bookingType,
      itemId,
      itemName,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      totalAmountIDR: officialTotalIDR,
      totalAmountUSD: officialTotalUSD,
      paymentType,
      dpPercentage: effectiveDpPercent,
      grossAmountPaidIDR: grossAmountIDR,
      remainingBalanceIDR,
      status: 'PENDING',
      snapToken,
      redirectUrl,
      isSimulation,
      startDate: req.body.startDate,
      deliveryLocation: req.body.deliveryLocation,
      driverOption,
      specialNotes: customer.notes || req.body.specialNotes,
      quantity: Number(quantity) || 1,
      emailSent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    transactionsDb.set(orderId, record);

    return res.json({
      success: true,
      orderId,
      snapToken,
      redirectUrl,
      isSimulation,
      paymentType,
      dpPercentage: effectiveDpPercent,
      grossAmountIDR,
      remainingBalanceIDR,
      totalAmountIDR: officialTotalIDR,
      totalAmountUSD: officialTotalUSD,
      message: isSimulation
        ? 'Mode simulasi aktif: Tambahkan MIDTRANS_SERVER_KEY di pengaturan / .env untuk menghubungkan ke akun Midtrans asli.'
        : 'Transaksi Midtrans Snap berhasil dibuat.',
    });
  } catch (error: any) {
    console.error('Create Transaction Error:', error);
    return res.status(500).json({
      error: error.message || 'Terjadi kesalahan saat memproses transaksi pembayaran.',
    });
  }
});

// Helper untuk pemetaan status transaksi resmi Midtrans
function resolveTransactionStatus(
  transactionStatus: string,
  fraudStatus?: string,
  paymentType?: 'dp' | 'full'
): {
  status: 'PENDING' | 'DP_PAID' | 'SETTLEMENT' | 'CANCELLED' | 'EXPIRED' | 'DENIED' | 'REFUNDED';
  isSuccess: boolean;
} {
  const normStatus = (transactionStatus || '').toLowerCase();
  const normFraud = (fraudStatus || '').toLowerCase();

  if (normStatus === 'capture') {
    if (normFraud === 'challenge') {
      return { status: 'PENDING', isSuccess: false };
    }
    if (normFraud === 'accept') {
      return { status: paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT', isSuccess: true };
    }
    return { status: 'DENIED', isSuccess: false };
  }

  if (normStatus === 'settlement') {
    return { status: paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT', isSuccess: true };
  }

  if (normStatus === 'pending') {
    return { status: 'PENDING', isSuccess: false };
  }

  if (normStatus === 'deny') {
    return { status: 'DENIED', isSuccess: false };
  }

  if (normStatus === 'expire') {
    return { status: 'EXPIRED', isSuccess: false };
  }

  if (normStatus === 'cancel') {
    return { status: 'CANCELLED', isSuccess: false };
  }

  if (normStatus === 'refund' || normStatus === 'partial_refund') {
    return { status: 'REFUNDED', isSuccess: false };
  }

  return { status: 'PENDING', isSuccess: false };
}

// Endpoint Webhook / Notification Handler (Verifikasi Signature SHA-512 Midtrans Anti-Hacker)
app.post('/api/payment/notification', async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
      transaction_id,
    } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'order_id wajib disertakan dalam webhook.' });
    }

    const { serverKey, isConfigured } = getMidtransConfig();

    // 1. LAPISAN KEAMANAN SHA-512:
    // Jika sistem sudah terkonfigurasi dengan Server Key, wajib memvalidasi signature SHA-512
    if (isConfigured) {
      if (!signature_key) {
        console.warn(`[Security Alert] Missing signature_key for order: ${order_id}`);
        return res.status(401).json({ error: 'Missing security signature_key (Unauthorized).' });
      }

      const expectedSignature = crypto
        .createHash('sha512')
        .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
        .digest('hex');

      if (signature_key.toLowerCase() !== expectedSignature.toLowerCase()) {
        console.warn(`[Security Alert] Invalid signature for order: ${order_id}`);
        return res.status(403).json({ error: 'Signature keamanan tidak valid (Forbidden).' });
      }
    }

    // 2. Cari data transaksi di database backend
    const record = transactionsDb.get(order_id);
    if (!record) {
      console.warn(`Order ${order_id} tidak ditemukan di database backend.`);
      // Menurut spesifikasi Midtrans, webhook harus merespons 200 OK agar Midtrans tidak terus mengulang pengiriman
      return res.status(200).json({ status: 'ok', warning: 'Order not found in database' });
    }

    // 3. LAPISAN ANTI-TAMPERING NOMINAL (Pencegahan manipulasi jumlah pembayaran)
    const incomingGross = Math.round(Number(gross_amount));
    if (gross_amount && Math.abs(incomingGross - record.grossAmountPaidIDR) > 1) {
      console.warn(
        `[Security Alert] Gross amount mismatch for order ${order_id}: Midtrans=${incomingGross}, Expected=${record.grossAmountPaidIDR}`
      );
      return res.status(400).json({ error: 'Gross amount mismatch. Potential tampering detected.' });
    }

    // 4. Analisis status transaksi Midtrans
    const { status: newStatus, isSuccess } = resolveTransactionStatus(
      transaction_status,
      fraud_status,
      record.paymentType
    );

    record.status = newStatus;
    if (payment_type) {
      record.paymentMethod = payment_type;
    }
    if (transaction_id) {
      record.midtransTransactionId = transaction_id;
    }
    record.updatedAt = new Date().toISOString();

    // 5. TRIGGER OTOMATIS: Kirim Email E-Voucher ke Tamu & Notifikasi Order ke Admin Hoola Holiday
    if (isSuccess && !record.emailSent) {
      record.emailSent = true;
      sendBookingConfirmationEmails({
        orderId: record.orderId,
        bookingType: record.bookingType,
        itemName: record.itemName,
        customerName: record.customerName,
        customerEmail: record.customerEmail,
        customerPhone: record.customerPhone,
        totalAmountIDR: record.totalAmountIDR,
        grossAmountPaidIDR: record.grossAmountPaidIDR,
        remainingBalanceIDR: record.remainingBalanceIDR,
        paymentType: record.paymentType,
        dpPercentage: record.dpPercentage,
        status: record.status,
        paymentMethod: record.paymentMethod || 'Midtrans Online Payment',
        startDate: record.startDate,
        deliveryLocation: record.deliveryLocation,
        driverOption: record.driverOption,
        quantity: record.quantity,
        specialNotes: record.specialNotes,
      }).catch((emailErr) => {
        console.error('[Email Trigger Error]:', emailErr);
      });
    }

    transactionsDb.set(order_id, record);
    console.log(`[Midtrans Webhook] Order ${order_id} status updated to: ${record.status}`);
    return res.status(200).json({ status: 'success', message: 'Notification processed' });
  } catch (error: any) {
    console.error('Notification error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint Verifikasi Status Transaksi Langsung ke Server Midtrans (Authoritative Server-to-Server)
// Memenuhi Persyaratan 6: Jangan pernah menganggap pembayaran berhasil hanya dari respons/redirect frontend.
app.post('/api/payment/verify-status/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId wajib diisi.' });
    }

    const record = transactionsDb.get(orderId);
    if (!record) {
      return res.status(404).json({ error: `Transaksi dengan ID ${orderId} tidak ditemukan.` });
    }

    const { serverKey, isConfigured, coreApiBaseUrl } = getMidtransConfig();

    if (isConfigured && !record.isSimulation) {
      // Panggil endpoint resmi Midtrans Get Status API: GET /v2/{order_id}/status
      const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
      const midtransRes = await fetch(`${coreApiBaseUrl}/${orderId}/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
        },
      });

      if (!midtransRes.ok) {
        const errorText = await midtransRes.text();
        console.warn(`Midtrans Status Inquiry failed for ${orderId}:`, errorText);
        // Jika belum tercatat di Midtrans, status tetap PENDING
        return res.json({
          success: true,
          verified: false,
          record,
          message: 'Status di Midtrans belum terupdate atau masih dalam proses.',
        });
      }

      const statusData = (await midtransRes.json()) as any;
      const { transaction_status, fraud_status, gross_amount, payment_type, transaction_id } = statusData;

      // Validasi nominal pembayaran dari Midtrans resmi
      const incomingGross = Math.round(Number(gross_amount));
      if (gross_amount && Math.abs(incomingGross - record.grossAmountPaidIDR) > 1) {
        console.warn(`[Security Alert] Inquiry gross amount mismatch for ${orderId}`);
        return res.status(400).json({ error: 'Gross amount mismatch during server verification.' });
      }

      const { status: authoritativeStatus, isSuccess } = resolveTransactionStatus(
        transaction_status,
        fraud_status,
        record.paymentType
      );

      record.status = authoritativeStatus;
      if (payment_type) record.paymentMethod = payment_type;
      if (transaction_id) record.midtransTransactionId = transaction_id;
      record.updatedAt = new Date().toISOString();

      if (isSuccess && !record.emailSent) {
        record.emailSent = true;
        sendBookingConfirmationEmails({
          orderId: record.orderId,
          bookingType: record.bookingType,
          itemName: record.itemName,
          customerName: record.customerName,
          customerEmail: record.customerEmail,
          customerPhone: record.customerPhone,
          totalAmountIDR: record.totalAmountIDR,
          grossAmountPaidIDR: record.grossAmountPaidIDR,
          remainingBalanceIDR: record.remainingBalanceIDR,
          paymentType: record.paymentType,
          dpPercentage: record.dpPercentage,
          status: record.status,
          paymentMethod: record.paymentMethod || 'Midtrans Online Payment',
          startDate: record.startDate,
          deliveryLocation: record.deliveryLocation,
          driverOption: record.driverOption,
          quantity: record.quantity,
          specialNotes: record.specialNotes,
        }).catch((err) => console.error('[Inquiry Email Error]:', err));
      }

      transactionsDb.set(orderId, record);
      return res.json({ success: true, verified: true, record });
    }

    // Jika dalam mode simulasi pengujian (belum ada Server Key di .env)
    return res.json({ success: true, verified: true, record });
  } catch (error: any) {
    console.error('Verify status error:', error);
    return res.status(500).json({ error: error.message || 'Gagal memverifikasi status pembayaran.' });
  }
});

// Endpoint untuk simulasi konfirmasi pembayaran (HANYA aktif dalam mode simulasi sandbox tanpa keys)
app.post('/api/payment/simulate-confirm', (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId wajib dikirim' });
  }

  const { isConfigured } = getMidtransConfig();
  const record = transactionsDb.get(orderId);

  // Jika sistem sudah terkonfigurasi Midtrans asli dan bukan order simulasi, tolak simulasi bypass!
  if (isConfigured && record && !record.isSimulation) {
    return res.status(403).json({
      error: 'Simulasi ditolak: Transaksi ini dibuat menggunakan akun Midtrans resmi. Pembayaran harus dilakukan via gerbang Midtrans resmi.',
    });
  }

  if (record) {
    record.status = record.paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT';
    record.updatedAt = new Date().toISOString();

    if (!record.emailSent) {
      record.emailSent = true;
      sendBookingConfirmationEmails({
        orderId: record.orderId,
        bookingType: record.bookingType,
        itemName: record.itemName,
        customerName: record.customerName,
        customerEmail: record.customerEmail,
        customerPhone: record.customerPhone,
        totalAmountIDR: record.totalAmountIDR,
        grossAmountPaidIDR: record.grossAmountPaidIDR,
        remainingBalanceIDR: record.remainingBalanceIDR,
        paymentType: record.paymentType,
        dpPercentage: record.dpPercentage,
        status: record.status,
        paymentMethod: record.paymentMethod || 'Midtrans Sandbox Gateway (Simulasi)',
        startDate: record.startDate,
        deliveryLocation: record.deliveryLocation,
        driverOption: record.driverOption,
        specialNotes: record.specialNotes,
      }).catch((err) => console.error('[Simulate Email Error]:', err));
    }

    transactionsDb.set(orderId, record);
    return res.json({ success: true, record });
  }

  return res.status(404).json({ error: 'Order tidak ditemukan untuk disimulasikan.' });
});

// Endpoint untuk memicu pengiriman email secara eksplisit setelah verifikasi (DILINDUNGI)
app.post('/api/payment/send-confirmation-email', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId wajib dikirim untuk verifikasi email.' });
    }

    const record = transactionsDb.get(orderId);
    if (!record) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan di database backend.' });
    }

    // Hanya kirim jika status pembayaran memang sudah lunas atau DP terverifikasi
    if (record.status !== 'SETTLEMENT' && record.status !== 'DP_PAID') {
      return res.status(403).json({
        error: 'Email tidak dapat dikirim karena pembayaran belum berstatus SETTLEMENT atau DP_PAID.',
      });
    }

    if (record.emailSent) {
      return res.json({ success: true, message: 'Email konfirmasi sudah pernah dikirim sebelumnya.' });
    }

    record.emailSent = true;
    transactionsDb.set(orderId, record);

    const emailResult = await sendBookingConfirmationEmails({
      orderId: record.orderId,
      bookingType: record.bookingType,
      itemName: record.itemName,
      customerName: record.customerName,
      customerEmail: record.customerEmail,
      customerPhone: record.customerPhone,
      totalAmountIDR: record.totalAmountIDR,
      grossAmountPaidIDR: record.grossAmountPaidIDR,
      remainingBalanceIDR: record.remainingBalanceIDR,
      paymentType: record.paymentType,
      dpPercentage: record.dpPercentage,
      status: record.status,
      paymentMethod: record.paymentMethod || 'Midtrans Online Payment',
      startDate: record.startDate,
      deliveryLocation: record.deliveryLocation,
      driverOption: record.driverOption,
      quantity: record.quantity,
      specialNotes: record.specialNotes,
    });

    return res.json({ success: true, emailResult });
  } catch (error: any) {
    console.error('Send Email Error:', error);
    return res.status(500).json({ error: error.message || 'Gagal mengirim email konfirmasi' });
  }
});

// Endpoint cek status transaksi
app.get('/api/payment/status/:orderId', (req: Request, res: Response) => {
  const { orderId } = req.params;
  const record = transactionsDb.get(orderId);
  if (!record) {
    return res.status(404).json({ error: 'Data transaksi tidak ditemukan' });
  }
  return res.json({ success: true, record });
});

// ============================================================================
// 4. VITE MIDDLEWARE & STATIC SERVER
// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hoola Holiday Bali] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
