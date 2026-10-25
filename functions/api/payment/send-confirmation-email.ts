// Cloudflare Pages Functions: POST /api/payment/send-confirmation-email
import { dispatchBookingEmails } from '../../../src/services/resendService';
import { resolveMidtransStatus } from '../../../src/services/pricingEngine';

export const onRequestPost = async (context: {
  request: Request;
  env: Record<string, string>;
  waitUntil?: (promise: Promise<any>) => void;
}) => {
  try {
    const env = context.env || {};
    const body: any = await context.request.json();
    const { orderId } = body;

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId wajib dikirim.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serverKey = env.MIDTRANS_SERVER_KEY || '';
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';
    const coreApiBaseUrl = isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2';

    // Verifikasi keabsahan pembayaran ke Midtrans terlebih dahulu
    const authHeader = `Basic ${btoa(`${serverKey}:`)}`;
    const midtransRes = await fetch(`${coreApiBaseUrl}/${encodeURIComponent(orderId)}/status`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
    });

    if (!midtransRes.ok && !orderId.startsWith('simulated-')) {
      return new Response(
        JSON.stringify({ error: 'Status pembayaran belum terkonfirmasi di Midtrans.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const statusData = midtransRes.ok ? await midtransRes.json() : ({} as any);
    const paymentType: 'dp' | 'full' = orderId.startsWith('HHB-DP') ? 'dp' : 'full';
    const { status: resolvedStatus, isSuccess } = resolveMidtransStatus(
      statusData.transaction_status || 'settlement',
      statusData.fraud_status,
      paymentType
    );

    if (!isSuccess && !orderId.startsWith('simulated-')) {
      return new Response(
        JSON.stringify({ error: `Pembayaran berstatus ${resolvedStatus}, belum lunas/DP.` }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const grossNum = Number(statusData.gross_amount) || 0;
    const isDP = paymentType === 'dp';
    const remainingBalance = isDP ? Math.round(grossNum * (70 / 30)) : 0;
    const totalAmount = grossNum + remainingBalance;

    const emailResult = await dispatchBookingEmails(
      {
        orderId,
        bookingType: 'tour',
        itemName: body.itemName || 'Paket Wisata Hoola Holiday Bali',
        customerName: body.customerName || statusData.customer_name || 'Tamu Terhormat',
        customerEmail: body.customerEmail || statusData.customer_email || 'nusawebworks@gmail.com',
        customerPhone: body.customerPhone || statusData.customer_phone || '-',
        totalAmountIDR: totalAmount,
        grossAmountPaidIDR: grossNum,
        remainingBalanceIDR: remainingBalance,
        paymentType,
        dpPercentage: 30,
        status: resolvedStatus,
        paymentMethod: statusData.payment_type || 'Midtrans Online Payment',
        startDate: body.startDate,
        quantity: body.quantity,
      },
      { ...env, RESEND_API_KEY: env.RESEND_API_KEY || '' }
    );

    return new Response(JSON.stringify({ success: true, emailResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Gagal mengirim email konfirmasi.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
