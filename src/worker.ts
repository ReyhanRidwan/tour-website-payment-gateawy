// ============================================================================
// HOOLA HOLIDAY BALI - CLOUDFLARE WORKER ROUTER (FULLSTACK & HARDENED)
// Menggabungkan Backend API (/api/*) dan Frontend Static Assets ([assets])
// Sesuai Standar Keamanan: OWASP Top 10, OWASP ASVS & Panduan Resmi Midtrans
// ============================================================================

import { z } from 'zod';
import {
  calculateOrderPricing,
  resolveMidtransStatus,
  USD_TO_IDR_RATE,
  verifyGrossAmountMatches,
} from './services/pricingEngine';
import { dispatchBookingEmails, escapeHtml } from './services/resendService';

export interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  MIDTRANS_SERVER_KEY?: string;
  MIDTRANS_CLIENT_KEY?: string;
  MIDTRANS_MERCHANT_ID?: string;
  MIDTRANS_IS_PRODUCTION?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ADMIN_EMAIL?: string;
}

// 1. DAFTAR ORIGIN RESMI YANG DIIZINKAN (OWASP A05: Anti-CORS Abuse)
const ALLOWED_ORIGINS = [
  'https://balinikitour.biz.id',
  'https://www.balinikitour.biz.id',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.workers.dev') ||
    origin.endsWith('.run.app');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://balinikitour.biz.id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: any, status = 200, request?: Request): Response {
  const cors = request ? getCorsHeaders(request) : {
    'Access-Control-Allow-Origin': 'https://balinikitour.biz.id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
    },
  });
}

// 2. CONSTANT-TIME EQUALITY COMPARISON (OWASP ASVS: Mencegah Timing Side-Channel Attack)
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// 3. CRYPTOGRAPHICALLY SECURE ORDER ID (CSPRNG via Web Crypto)
function generateSecureOrderId(prefix: string): string {
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${Date.now()}-${randomHex}`;
}

// 4. RATE LIMITER BERBASIS IP (Mencegah Spamming Booking & DoS)
const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(clientIp: string, maxRequests = 25, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = ipRateLimitMap.get(clientIp);
  if (!entry || now > entry.resetTime) {
    ipRateLimitMap.set(clientIp, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// 5. SHA-512 HELPER RESMI MIDTRANS
async function calculateSha512(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 6. SKEMA VALIDASI KETAT DENGAN ZOD (OWASP A03: Input Validation & Sanitization)
const createTransactionSchema = z.object({
  bookingType: z.enum(['tour', 'rental']).default('tour'),
  itemId: z.string().trim().min(1, 'itemId wajib diisi').max(100),
  quantity: z.coerce.number().int().min(1, 'Minimal 1 pax/hari').max(50, 'Maksimal 50 pax/hari').default(1),
  addons: z.array(z.string().trim().max(50)).optional().default([]),
  driverOption: z.enum(['with', 'without']).optional().default('with'),
  paymentType: z.enum(['dp', 'full']).default('dp'),
  dpPercentage: z.coerce.number().min(10).max(100).optional().default(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
  deliveryLocation: z.string().max(255).optional(),
  specialNotes: z.string().max(1000).optional(),
  customer: z.object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
    email: z.string().trim().email('Format email tidak valid').max(120),
    phone: z.string().trim().min(8, 'Nomor telepon minimal 8 digit').max(20, 'Nomor telepon maksimal 20 digit'),
    notes: z.string().max(1000).optional(),
  }),
});

// Cache in-memory untuk menyimpan order data & anti-duplikasi email
const orderCustomerMap = new Map<string, any>();
const emailedOrders = new Set<string>();

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil?: (p: Promise<any>) => void }): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // 1. CORS Preflight Handling (Strict Method)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const serverKey = env.MIDTRANS_SERVER_KEY || '';
    const resendApiKey = env.RESEND_API_KEY || '';
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';
    const coreApiBaseUrl = isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2';
    const snapBaseUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    // ------------------------------------------------------------------------
    // ROUTE 1: GET /api/health
    // ------------------------------------------------------------------------
    if (pathname === '/api/health') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'Hoola Holiday Bali - Hardened Payment Gateway Worker',
          worker: 'tour-website-payment-gateawy',
          security: {
            zodValidation: true,
            timingSafeEqual: true,
            csprngOrderId: true,
            authoritativeVerification: true,
          },
          midtrans: {
            configured: Boolean(serverKey && serverKey.length > 10),
            environment: isProduction ? 'production' : 'sandbox',
            merchantId: env.MIDTRANS_MERCHANT_ID || 'M967161571',
          },
          resend: {
            configured: Boolean(resendApiKey && resendApiKey.startsWith('re_')),
          },
          timestamp: new Date().toISOString(),
        },
        200,
        request
      );
    }

    // ------------------------------------------------------------------------
    // ROUTE 2: GET /api/payment/config
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/config') {
      const clientKey = env.MIDTRANS_CLIENT_KEY || 'Mid-client-fHdtxHc9aBZ7eZi1';
      const snapJsUrl = isProduction
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js';

      return jsonResponse(
        {
          clientKey,
          merchantId: env.MIDTRANS_MERCHANT_ID || 'M967161571',
          isProduction,
          isConfigured: Boolean(clientKey),
          snapJsUrl,
          defaultDpPercentage: 30,
          usdToIdrRate: USD_TO_IDR_RATE,
        },
        200,
        request
      );
    }

    // ------------------------------------------------------------------------
    // ROUTE 3: POST /api/payment/create-transaction (Divalidasi dengan Zod & CSPRNG)
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/create-transaction' && request.method === 'POST') {
      try {
        const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
        if (!checkRateLimit(clientIp)) {
          return jsonResponse({ error: 'Terlalu banyak permintaan pemesanan. Mohon tunggu beberapa saat.' }, 429, request);
        }

        let rawBody: any;
        try {
          rawBody = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON payload.' }, 400, request);
        }

        const parseResult = createTransactionSchema.safeParse(rawBody);
        if (!parseResult.success) {
          const firstError = parseResult.error.issues[0]?.message || 'Validasi data pemesanan gagal.';
          return jsonResponse({ error: firstError, details: parseResult.error.issues }, 400, request);
        }

        const validatedData = parseResult.data;
        const { bookingType, itemId, quantity, addons, driverOption, customer, paymentType, dpPercentage } = validatedData;

        // Validasi & Hitung Harga Resmi di Server dari data resmi (Tolak jika ID tidak sah)
        const pricing = calculateOrderPricing({
          bookingType,
          itemId,
          quantity,
          addons,
          driverOption,
          paymentType,
          dpPercentage,
        });

        // Generate Order ID Acak Kriptografis (CSPRNG)
        const prefix = paymentType === 'dp' ? 'HHB-DP' : 'HHB-FULL';
        const orderId = generateSecureOrderId(prefix);

        if (!serverKey || serverKey.length <= 10) {
          return jsonResponse(
            {
              error: 'Kunci MIDTRANS_SERVER_KEY belum terpasang atau sedang disiapkan di server Cloudflare. Mohon pastikan secret MIDTRANS_SERVER_KEY telah diatur di Cloudflare Workers.',
            },
            503,
            request
          );
        }

        const authHeader = `Basic ${btoa(`${serverKey}:`)}`;

        const midtransPayload = {
          transaction_details: {
            order_id: orderId,
            gross_amount: pricing.grossAmountIDR,
          },
          item_details: [
            {
              id: itemId,
              price: pricing.grossAmountIDR,
              quantity: 1,
              name: (paymentType === 'dp'
                ? `DP ${pricing.effectiveDpPercent}% - ${pricing.itemName}`
                : `Lunas - ${pricing.itemName}`
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
          custom_field1: (customer.name || '').slice(0, 255),
          custom_field2: (customer.email || '').slice(0, 255),
          custom_field3: `${customer.phone || '-'} | ${pricing.itemName || 'Tour'}`.slice(0, 255),
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
          throw new Error(midtransData.error_messages?.join(', ') || 'Gagal membuat sesi transaksi Midtrans.');
        }

        const snapToken = midtransData.token;
        const redirectUrl = midtransData.redirect_url;

        // Simpan data order ke in-memory map untuk anti-tampering & presisi email
        orderCustomerMap.set(orderId, {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          itemName: pricing.itemName,
          startDate: validatedData.startDate,
          quantity: validatedData.quantity,
          specialNotes: validatedData.specialNotes || customer.notes,
          paymentType,
          expectedGrossAmountIDR: pricing.grossAmountIDR,
          totalAmountIDR: pricing.totalAmountIDR,
          remainingBalanceIDR: pricing.remainingBalanceIDR,
          dpPercentage: pricing.effectiveDpPercent,
        });

        return jsonResponse(
          {
            success: true,
            orderId,
            snapToken,
            redirectUrl,
            isSimulation: false,
            paymentType,
            dpPercentage: pricing.effectiveDpPercent,
            grossAmountIDR: pricing.grossAmountIDR,
            remainingBalanceIDR: pricing.remainingBalanceIDR,
            totalAmountIDR: pricing.totalAmountIDR,
            totalAmountUSD: pricing.totalAmountUSD,
            message: 'Transaksi Midtrans Snap berhasil dibuat oleh Cloudflare Worker.',
          },
          200,
          request
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error processing transaction' }, 500, request);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 4: POST /api/payment/notification (WEBHOOK RESMI DARI MIDTRANS)
    // Hardened with SHA-512 constant-time verification & Authoritative Inquiry
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/notification' && request.method === 'POST') {
      try {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON payload.' }, 400, request);
        }

        const {
          order_id,
          status_code,
          gross_amount,
          signature_key,
          transaction_status,
          fraud_status,
          payment_type,
        } = body;

        if (!order_id) {
          return jsonResponse({ error: 'order_id wajib disertakan dalam webhook.' }, 400, request);
        }

        if (!serverKey || serverKey.length <= 10) {
          console.warn(`[Security Alert] Server key not configured for notification processing`);
          return jsonResponse({ error: 'MIDTRANS_SERVER_KEY not configured.' }, 500, request);
        }

        // 1. WAJIBKAN SIGNATURE_KEY & CONSTANT-TIME COMPARISON (OWASP Cryptographic Failures)
        if (!signature_key || typeof signature_key !== 'string') {
          console.warn(`[Security Alert] Missing signature_key for order: ${order_id}`);
          return jsonResponse({ error: 'Missing security signature_key (Unauthorized).' }, 401, request);
        }

        // Sesuai rumus resmi Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey)
        // gross_amount dipakai persis sebagai string dari payload
        const rawString = `${order_id}${status_code}${gross_amount}${serverKey}`;
        const expectedSignature = await calculateSha512(rawString);

        if (!timingSafeEqual(signature_key.toLowerCase(), expectedSignature.toLowerCase())) {
          console.warn(`[Security Alert] Invalid signature for order: ${order_id}`);
          return jsonResponse({ error: 'Signature keamanan tidak valid (Forbidden).' }, 403, request);
        }

        // 2. AUTHORITATIVE GET STATUS API DOUBLE-CHECK (Midtrans Best Practice)
        // Hubungi server Midtrans langsung untuk memastikan keabsahan status dari database inti Midtrans
        const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
        const midtransVerifyRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(order_id)}/status`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': authHeader,
          },
        });

        if (!midtransVerifyRes.ok) {
          console.warn(`[Security Alert] Authoritative status check failed for order: ${order_id}`);
          return jsonResponse({ error: 'Authoritative transaction verification failed.' }, 403, request);
        }

        const authoritativeData = (await midtransVerifyRes.json()) as any;

        // 3. VALIDASI ANTI-TAMPERING GROSS AMOUNT TERHADAP RESPON AUTHORITATIVE
        if (!verifyGrossAmountMatches(Number(gross_amount), authoritativeData.gross_amount)) {
          console.warn(`[Security Alert] Gross amount mismatch between payload and authoritative record`);
          return jsonResponse({ error: 'Gross amount mismatch.' }, 400, request);
        }

        const paymentType: 'dp' | 'full' = order_id.startsWith('HHB-DP') ? 'dp' : 'full';
        const { status: resolvedStatus, isSuccess } = resolveMidtransStatus(
          authoritativeData.transaction_status,
          authoritativeData.fraud_status,
          paymentType
        );

        // Jika transaksi gagal/batal/kedaluwarsa (expire, cancel, deny), balas 200 OK ke Midtrans tanpa kirim voucher
        if (!isSuccess) {
          console.log(`[Midtrans Webhook] Transaksi ${order_id} berstatus ${resolvedStatus}. Tidak ada voucher dikirim.`);
          return jsonResponse({
            status: 'ok',
            orderId: order_id,
            transactionStatus: resolvedStatus,
            message: 'Notification acknowledged (non-success status)',
          }, 200, request);
        }

        // 4. IDEMPOTENSI: HANYA KIRIM EMAIL JIKA BELUM PERNAH DIKIRIM
        if (isSuccess && !emailedOrders.has(order_id)) {
          emailedOrders.add(order_id);

          const savedCustomer = orderCustomerMap.get(order_id) || {};
          const grossNum = Number(authoritativeData.gross_amount) || 0;
          const isDP = paymentType === 'dp';
          const remainingBalance = savedCustomer.remainingBalanceIDR !== undefined
            ? savedCustomer.remainingBalanceIDR
            : (isDP ? Math.round(grossNum * (70 / 30)) : 0);
          const totalAmount = savedCustomer.totalAmountIDR || (grossNum + remainingBalance);

          const customField1 = body.custom_field1 || authoritativeData.custom_field1;
          const customField2 = body.custom_field2 || authoritativeData.custom_field2;
          const customField3 = body.custom_field3 || authoritativeData.custom_field3 || '';
          const [customPhone, customItem] = customField3.includes(' | ')
            ? customField3.split(' | ')
            : [customField3, ''];

          const guestName = customField1 || savedCustomer.name || 'Tamu Terhormat';
          const guestEmail = customField2 || savedCustomer.email || '';
          const guestPhone = (customPhone && customPhone !== '-')
            ? customPhone
            : (savedCustomer.phone || '-');
          const itemTitle = customItem || savedCustomer.itemName || 'Paket Wisata Hoola Holiday Bali';

          const emailPromise = dispatchBookingEmails(
            {
              orderId: order_id,
              bookingType: 'tour',
              itemName: itemTitle,
              customerName: guestName,
              customerEmail: guestEmail,
              customerPhone: guestPhone,
              startDate: savedCustomer.startDate,
              quantity: savedCustomer.quantity,
              specialNotes: savedCustomer.specialNotes,
              totalAmountIDR: totalAmount,
              grossAmountPaidIDR: grossNum,
              remainingBalanceIDR: remainingBalance,
              paymentType,
              dpPercentage: savedCustomer.dpPercentage || 30,
              status: resolvedStatus,
              paymentMethod: authoritativeData.payment_type || payment_type || 'Midtrans Online Payment',
            },
            {
              ...env,
              RESEND_API_KEY: resendApiKey,
              RESEND_FROM: env.RESEND_FROM || 'Hoola Holiday Bali <booking@balinikitour.biz.id>',
              ADMIN_EMAIL: env.ADMIN_EMAIL || 'reyhanridwan30@gmail.com',
            }
          );

          if (ctx.waitUntil) {
            ctx.waitUntil(emailPromise);
          } else {
            await emailPromise;
          }
        }

        return jsonResponse(
          {
            status: 'success',
            orderId: order_id,
            transactionStatus: resolvedStatus,
            message: 'Notification verified and processed authoritatively.',
          },
          200,
          request
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error processing webhook notification' }, 500, request);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 5: POST /api/payment/verify-status (Authoritative Verification for Frontend UI)
    // ------------------------------------------------------------------------
    if (pathname.startsWith('/api/payment/verify-status') && request.method === 'POST') {
      try {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const pathParts = pathname.split('/').filter(Boolean);
        const orderId =
          body.orderId ||
          searchParams.get('orderId') ||
          (pathParts.length > 3 ? pathParts[pathParts.length - 1] : '');

        if (!orderId) {
          return jsonResponse({ error: 'orderId wajib diisi.' }, 400, request);
        }

        if (!serverKey || serverKey.length <= 10) {
          return jsonResponse(
            {
              error: 'Kunci MIDTRANS_SERVER_KEY belum terpasang di Cloudflare. Verifikasi status tidak dapat dilakukan.',
            },
            503,
            request
          );
        }

        const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
        const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': authHeader,
          },
        });

        if (!midtransRes.ok) {
          return jsonResponse(
            {
              success: true,
              verified: false,
              message: 'Status di Midtrans belum terupdate atau masih diproses.',
            },
            200,
            request
          );
        }

        const statusData = (await midtransRes.json()) as any;
        const { transaction_status, fraud_status, gross_amount, payment_type, transaction_id } = statusData;

        const paymentType: 'dp' | 'full' = orderId.startsWith('HHB-DP') ? 'dp' : 'full';
        const { status: authoritativeStatus, isSuccess } = resolveMidtransStatus(
          transaction_status,
          fraud_status,
          paymentType
        );

        const grossNum = Number(gross_amount) || 0;
        const isDP = paymentType === 'dp';
        const remainingBalance = isDP ? Math.round(grossNum * (70 / 30)) : 0;
        const totalAmount = grossNum + remainingBalance;

        const record = {
          orderId,
          bookingType: 'tour',
          itemName: statusData.custom_field3 ? statusData.custom_field3.split(' | ')[1] : 'Paket Tour Hoola Holiday Bali',
          totalAmountIDR: totalAmount,
          grossAmountPaidIDR: grossNum,
          remainingBalanceIDR: remainingBalance,
          paymentType,
          dpPercentage: 30,
          status: authoritativeStatus,
          paymentMethod: payment_type || 'Midtrans Online Payment',
          midtransTransactionId: transaction_id,
          isSimulation: false,
          updatedAt: new Date().toISOString(),
        };

        return jsonResponse({ success: true, verified: true, record }, 200, request);
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Gagal memverifikasi status pembayaran.' }, 500, request);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 6: GET /api/payment/status
    // ------------------------------------------------------------------------
    if (pathname.startsWith('/api/payment/status') && request.method === 'GET') {
      try {
        const pathParts = pathname.split('/').filter(Boolean);
        const orderId =
          searchParams.get('orderId') ||
          (pathParts.length > 3 ? pathParts[pathParts.length - 1] : '');

        if (!orderId) {
          return jsonResponse({ error: 'orderId wajib diisi.' }, 400, request);
        }

        if (!serverKey || serverKey.length <= 10) {
          return jsonResponse(
            {
              error: 'Kunci MIDTRANS_SERVER_KEY belum terpasang di Cloudflare.',
            },
            503,
            request
          );
        }

        const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
        const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': authHeader,
          },
        });

        if (!midtransRes.ok) {
          return jsonResponse({ success: false, error: 'Data transaksi tidak ditemukan di Midtrans' }, 404, request);
        }

        const statusData = (await midtransRes.json()) as any;
        const paymentType: 'dp' | 'full' = orderId.startsWith('HHB-DP') ? 'dp' : 'full';
        const { status: resolvedStatus } = resolveMidtransStatus(
          statusData.transaction_status,
          statusData.fraud_status,
          paymentType
        );

        return jsonResponse(
          {
            success: true,
            record: {
              orderId,
              status: resolvedStatus,
              rawStatus: statusData.transaction_status,
              grossAmount: statusData.gross_amount,
              paymentType: statusData.payment_type,
            },
          },
          200,
          request
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error checking status' }, 500, request);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 7: FALLBACK FRONTEND STATIC ASSETS (REACT SPA)
    // Cloudflare Worker melayani dist/index.html & asset frontend
    // ------------------------------------------------------------------------
    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
