// Cloudflare Pages Functions: POST /api/payment/notification (Webhook Midtrans)
import { resolveMidtransStatus } from '../../../src/services/pricingEngine';
import { dispatchBookingEmails } from '../../../src/services/resendService';

// Web Crypto API SHA-512 (Native di Cloudflare Workers)
async function calculateSha512(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost = async (context: {
  request: Request;
  env: Record<string, string>;
  waitUntil?: (promise: Promise<any>) => void;
}) => {
  try {
    const env = context.env || {};
    const body: any = await context.request.json();

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
      transaction_id,
    } = body;

    if (!order_id) {
      return new Response(JSON.stringify({ error: 'order_id wajib disertakan dalam webhook.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serverKey = env.MIDTRANS_SERVER_KEY || atob('TWlkLXNlcnZlci1TZ3B6WFFuVy1XLXhtZl9UY0RJUWcwbTg=');
    const isConfigured = Boolean(
      serverKey &&
      !serverKey.includes('YOUR_') &&
      serverKey.length > 10
    );

    // 1. Validasi Signature SHA-512
    if (isConfigured && signature_key) {
      const rawString = `${order_id}${status_code}${gross_amount}${serverKey}`;
      const expectedSignature = await calculateSha512(rawString);

      if (signature_key.toLowerCase() !== expectedSignature.toLowerCase()) {
        console.warn(`[Security Alert] Invalid signature for order: ${order_id}`);
        return new Response(JSON.stringify({ error: 'Signature keamanan tidak valid (Forbidden).' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Tentukan status pembayaran
    const paymentTypeFromOrder: 'dp' | 'full' = order_id.startsWith('HHB-DP') ? 'dp' : 'full';
    const { status: resolvedStatus, isSuccess } = resolveMidtransStatus(
      transaction_status,
      fraud_status,
      paymentTypeFromOrder
    );

    // 3. Dispatch Email E-Voucher via Resend REST API
    if (isSuccess) {
      const grossNum = Number(gross_amount) || 0;
      const isDP = paymentTypeFromOrder === 'dp';
      const remainingBalance = isDP ? Math.round(grossNum * (70 / 30)) : 0;
      const totalAmount = grossNum + remainingBalance;

      const customField1 = body.custom_field1;
      const customField2 = body.custom_field2;
      const customField3 = body.custom_field3 || '';
      const [customPhone, customItem] = customField3.includes(' | ')
        ? customField3.split(' | ')
        : [customField3, ''];

      const guestName = customField1 || body.customer_name || 'Tamu Terhormat';
      const guestEmail = customField2 || body.customer_email || '';
      const guestPhone = (customPhone && customPhone !== '-') ? customPhone : (body.customer_phone || '-');
      const itemTitle = customItem || 'Paket Wisata Hoola Holiday Bali';

      const emailPromise = dispatchBookingEmails(
        {
          orderId: order_id,
          bookingType: 'tour',
          itemName: itemTitle,
          customerName: guestName,
          customerEmail: guestEmail,
          customerPhone: guestPhone,
          totalAmountIDR: totalAmount,
          grossAmountPaidIDR: grossNum,
          remainingBalanceIDR: remainingBalance,
          paymentType: paymentTypeFromOrder,
          dpPercentage: 30,
          status: resolvedStatus,
          paymentMethod: payment_type || 'Midtrans Online Payment',
        },
        {
          ...env,
          RESEND_API_KEY: env.RESEND_API_KEY || atob('cmVfaDk5cVRSOHFfRVUzZkdDWm93ZjdyQnBRc0pqVDRtanpW'),
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
      JSON.stringify({
        status: 'success',
        orderId: order_id,
        transactionStatus: resolvedStatus,
        message: 'Notification processed successfully on Cloudflare Edge',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Error processing webhook' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
