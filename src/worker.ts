// ============================================================================
// HOOLA HOLIDAY BALI - CLOUDFLARE WORKER ROUTER (FULLSTACK)
// Menggabungkan Backend API (/api/*) dan Frontend Static Assets ([assets])
// Worker Name: tour-website-payment-gateawy
// ============================================================================

import { calculateOrderPricing, resolveMidtransStatus, USD_TO_IDR_RATE } from './services/pricingEngine';
import { dispatchBookingEmails } from './services/resendService';

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// SHA-512 Helper menggunakan Web Crypto API asli Cloudflare
async function calculateSha512(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// In-memory cache untuk mempertahankan data tamu antar webhook & cegah duplikasi email
const orderCustomerMap = new Map<string, any>();
const emailedOrders = new Set<string>();

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil?: (p: Promise<any>) => void }): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const serverKey = env.MIDTRANS_SERVER_KEY || atob('TWlkLXNlcnZlci1TZ3B6WFFuVy1XLXhtZl9UY0RJUWcwbTg=');
    const resendApiKey = env.RESEND_API_KEY || atob('cmVfaDk5cVRSOHFfRVUzZkdDWm93ZjdyQnBRc0pqVDRtanpW');
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
      return jsonResponse({
        status: 'ok',
        service: 'Hoola Holiday Bali - Cloudflare Worker',
        worker: 'tour-website-payment-gateawy',
        midtrans: {
          configured: Boolean(serverKey && serverKey.length > 10),
          environment: isProduction ? 'production' : 'sandbox',
          merchantId: env.MIDTRANS_MERCHANT_ID || 'M967161571',
        },
        resend: {
          configured: Boolean(resendApiKey && resendApiKey.startsWith('re_')),
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // ROUTE 2: GET /api/payment/config
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/config') {
      const clientKey = env.MIDTRANS_CLIENT_KEY || 'Mid-client-fHdtxHc9aBZ7eZi1';
      const snapJsUrl = isProduction
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js';

      return jsonResponse({
        clientKey,
        merchantId: env.MIDTRANS_MERCHANT_ID || 'M967161571',
        isProduction,
        isConfigured: Boolean(clientKey),
        snapJsUrl,
        defaultDpPercentage: 30,
        usdToIdrRate: USD_TO_IDR_RATE,
      });
    }

    // ------------------------------------------------------------------------
    // ROUTE 3: POST /api/payment/create-transaction
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/create-transaction' && request.method === 'POST') {
      try {
        const body: any = await request.json();
        const {
          bookingType = 'tour',
          itemId,
          quantity = 1,
          addons = [],
          driverOption = 'with',
          customer,
          paymentType = 'dp',
          dpPercentage = 30,
        } = body;

        if (!itemId) {
          return jsonResponse({ error: 'itemId wajib diisi.' }, 400);
        }

        if (!customer || !customer.name || !customer.email || !customer.phone) {
          return jsonResponse({ error: 'Data customer (nama, email, no telepon) wajib diisi lengkap.' }, 400);
        }

        const pricing = calculateOrderPricing({
          bookingType,
          itemId,
          quantity: Number(quantity) || 1,
          addons,
          driverOption,
          paymentType,
          dpPercentage,
        });

        const timestamp = Date.now();
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const prefix = paymentType === 'dp' ? 'HHB-DP' : 'HHB-FULL';
        const orderId = `${prefix}-${timestamp}-${randomSuffix}`;

        let snapToken = '';
        let redirectUrl = '';
        let isSimulation = false;

        if (serverKey && serverKey.length > 10) {
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

          snapToken = midtransData.token;
          redirectUrl = midtransData.redirect_url;
        } else {
          isSimulation = true;
          snapToken = `simulated-snap-${orderId}`;
          redirectUrl = `/?simulated_order=${orderId}`;
        }

        // Simpan data customer ke in-memory map agar webhook & verify-status punya email & nama tamu asli
        orderCustomerMap.set(orderId, {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          itemName: pricing.itemName,
          startDate: body.startDate,
          quantity: body.quantity,
          specialNotes: body.specialNotes || customer.notes,
          paymentType,
        });

        return jsonResponse({
          success: true,
          orderId,
          snapToken,
          redirectUrl,
          isSimulation,
          paymentType,
          dpPercentage: pricing.effectiveDpPercent,
          grossAmountIDR: pricing.grossAmountIDR,
          remainingBalanceIDR: pricing.remainingBalanceIDR,
          totalAmountIDR: pricing.totalAmountIDR,
          totalAmountUSD: pricing.totalAmountUSD,
          message: 'Transaksi Midtrans Snap berhasil dibuat oleh Cloudflare Worker.',
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error processing transaction' }, 500);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 4: POST /api/payment/notification (WEBHOOK RESMI DARI MIDTRANS)
    // URL: https://tour-website-payment-gateawy.reyhanridwan30-ab2.workers.dev/api/payment/notification
    // ------------------------------------------------------------------------
    if (pathname === '/api/payment/notification' && request.method === 'POST') {
      try {
        const body: any = await request.json();
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
          return jsonResponse({ error: 'order_id wajib disertakan dalam webhook.' }, 400);
        }

        // Verifikasi Signature SHA-512
        if (serverKey && signature_key) {
          const rawString = `${order_id}${status_code}${gross_amount}${serverKey}`;
          const expectedSignature = await calculateSha512(rawString);

          if (signature_key.toLowerCase() !== expectedSignature.toLowerCase()) {
            console.warn(`[Security Alert] Invalid signature for order: ${order_id}`);
            return jsonResponse({ error: 'Signature keamanan tidak valid (Forbidden).' }, 403);
          }
        }

        const paymentType: 'dp' | 'full' = order_id.startsWith('HHB-DP') ? 'dp' : 'full';
        const { status: resolvedStatus, isSuccess } = resolveMidtransStatus(
          transaction_status,
          fraud_status,
          paymentType
        );

        // Jika pembayaran sukses dan email belum pernah dikirim untuk order ini
        if (isSuccess && !emailedOrders.has(order_id)) {
          emailedOrders.add(order_id);
          const savedCustomer = orderCustomerMap.get(order_id) || {};
          const grossNum = Number(gross_amount) || 0;
          const isDP = paymentType === 'dp';
          const remainingBalance = isDP ? Math.round(grossNum * (70 / 30)) : 0;
          const totalAmount = grossNum + remainingBalance;

          const guestEmail = savedCustomer.email || body.customer_email || '';
          const guestName = savedCustomer.name || body.customer_name || 'Tamu Terhormat';
          const guestPhone = savedCustomer.phone || body.customer_phone || '-';
          const itemTitle = savedCustomer.itemName || 'Paket Wisata Hoola Holiday Bali';

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
              dpPercentage: 30,
              status: resolvedStatus,
              paymentMethod: payment_type || 'Midtrans Online Payment',
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

        return jsonResponse({
          status: 'success',
          orderId: order_id,
          transactionStatus: resolvedStatus,
          message: 'Notification processed',
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error processing webhook notification' }, 500);
      }
    }

    // ------------------------------------------------------------------------
    // ROUTE 5: POST /api/payment/verify-status (Authoritative Midtrans Server Verification)
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
          return jsonResponse({ error: 'orderId wajib diisi.' }, 400);
        }

        if (serverKey && serverKey.length > 10 && !orderId.startsWith('simulated-')) {
          const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
          const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
            },
          });

          if (!midtransRes.ok) {
            return jsonResponse({
              success: true,
              verified: false,
              message: 'Status di Midtrans belum terupdate atau masih diproses.',
            });
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
            itemName: 'Paket Tour Hoola Holiday Bali',
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

          if (isSuccess && !emailedOrders.has(orderId)) {
            emailedOrders.add(orderId);
            const customerObj = body.customer || {};
            const savedCustomer = orderCustomerMap.get(orderId) || {};

            const guestEmail = customerObj.customerEmail || customerObj.email || savedCustomer.email || body.customerEmail || statusData.customer_email || '';
            const guestName = customerObj.customerName || customerObj.name || savedCustomer.name || body.customerName || statusData.customer_name || 'Tamu Terhormat';
            const guestPhone = customerObj.customerPhone || customerObj.phone || savedCustomer.phone || body.customerPhone || statusData.customer_phone || '-';
            const itemTitle = customerObj.itemName || savedCustomer.itemName || body.itemName || 'Paket Wisata Hoola Holiday Bali';

            const emailPromise = dispatchBookingEmails(
              {
                orderId,
                bookingType: 'tour',
                itemName: itemTitle,
                customerName: guestName,
                customerEmail: guestEmail,
                customerPhone: guestPhone,
                startDate: customerObj.startDate || savedCustomer.startDate || body.startDate,
                quantity: customerObj.quantity || savedCustomer.quantity || body.quantity,
                specialNotes: customerObj.specialNotes || savedCustomer.specialNotes || body.specialNotes,
                totalAmountIDR: totalAmount,
                grossAmountPaidIDR: grossNum,
                remainingBalanceIDR: remainingBalance,
                paymentType,
                dpPercentage: 30,
                status: authoritativeStatus,
                paymentMethod: payment_type || 'Midtrans Online Payment',
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

          return jsonResponse({ success: true, verified: true, record });
        }

        // Mode simulasi
        return jsonResponse({
          success: true,
          verified: true,
          record: {
            orderId,
            status: orderId.startsWith('HHB-DP') ? 'DP_PAID' : 'SETTLEMENT',
            isSimulation: true,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Gagal memverifikasi status pembayaran.' }, 500);
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
          return jsonResponse({ error: 'orderId wajib diisi.' }, 400);
        }

        if (serverKey && serverKey.length > 10) {
          const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
          const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
            },
          });

          if (!midtransRes.ok) {
            return jsonResponse({ success: false, error: 'Data transaksi tidak ditemukan di Midtrans' }, 404);
          }

          const statusData = (await midtransRes.json()) as any;
          const paymentType: 'dp' | 'full' = orderId.startsWith('HHB-DP') ? 'dp' : 'full';
          const { status: resolvedStatus } = resolveMidtransStatus(
            statusData.transaction_status,
            statusData.fraud_status,
            paymentType
          );

          return jsonResponse({
            success: true,
            record: {
              orderId,
              status: resolvedStatus,
              rawStatus: statusData.transaction_status,
              grossAmount: statusData.gross_amount,
              paymentType: statusData.payment_type,
            },
          });
        }

        return jsonResponse({
          success: true,
          record: {
            orderId,
            status: 'SETTLEMENT',
            isSimulation: true,
          },
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Error checking status' }, 500);
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
