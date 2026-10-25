// Cloudflare Pages Functions: POST /api/payment/verify-status
import { resolveMidtransStatus } from '../../../src/services/pricingEngine';
import { dispatchBookingEmails } from '../../../src/services/resendService';

export const onRequestPost = async (context: {
  request: Request;
  env: Record<string, string>;
  waitUntil?: (promise: Promise<any>) => void;
}) => {
  try {
    const env = context.env || {};
    const url = new URL(context.request.url);

    let body: any = {};
    try {
      body = await context.request.json();
    } catch {
      body = {};
    }

    // Ekstrak orderId dari JSON body, query parameter, atau URL path
    const pathParts = url.pathname.split('/').filter(Boolean);
    const orderId =
      body.orderId ||
      url.searchParams.get('orderId') ||
      (pathParts.length > 3 ? pathParts[pathParts.length - 1] : '');

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId wajib diisi.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serverKey = env.MIDTRANS_SERVER_KEY || '';
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';

    const coreApiBaseUrl = isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2';

    const isConfigured = Boolean(
      serverKey &&
      !serverKey.includes('YOUR_') &&
      serverKey.length > 10
    );

    if (!isConfigured) {
      return new Response(
        JSON.stringify({ error: 'Kunci MIDTRANS_SERVER_KEY belum terpasang di Cloudflare.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Panggil endpoint resmi Midtrans Get Status API: GET /v2/{order_id}/status
    const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
      const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
        },
      });

      if (!midtransRes.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            verified: false,
            message: 'Status di Midtrans belum terupdate atau transaksi belum diselesaikan.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
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

      // Auto trigger email jika pembayaran telah sukses
      if (isSuccess) {
        const customerObj = body.customer || {};
        const guestEmail = customerObj.customerEmail || customerObj.email || body.customerEmail || statusData.customer_email || '';
        const guestName = customerObj.customerName || customerObj.name || body.customerName || statusData.customer_name || 'Tamu Terhormat';
        const guestPhone = customerObj.customerPhone || customerObj.phone || body.customerPhone || statusData.customer_phone || '-';
        const itemTitle = customerObj.itemName || body.itemName || 'Paket Wisata Hoola Holiday Bali';

        const emailPromise = dispatchBookingEmails(
          {
            orderId,
            bookingType: 'tour',
            itemName: itemTitle,
            customerName: guestName,
            customerEmail: guestEmail,
            customerPhone: guestPhone,
            startDate: customerObj.startDate || body.startDate,
            quantity: customerObj.quantity || body.quantity,
            specialNotes: customerObj.specialNotes || body.specialNotes,
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
            RESEND_API_KEY: env.RESEND_API_KEY || '',
            RESEND_FROM: env.RESEND_FROM || 'Hoola Holiday Bali <booking@balinikitour.biz.id>',
            ADMIN_EMAIL: env.ADMIN_EMAIL || 'reyhanridwan30@gmail.com',
          }
        );

        if (context.waitUntil) {
          context.waitUntil(emailPromise);
        } else {
          await emailPromise;
        }
      }

      return new Response(
        JSON.stringify({ success: true, verified: true, record }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Gagal memverifikasi status pembayaran.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
