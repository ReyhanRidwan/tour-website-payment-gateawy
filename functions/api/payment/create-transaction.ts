// Cloudflare Pages Functions: POST /api/payment/create-transaction
import { calculateOrderPricing } from '../../../src/services/pricingEngine';

export const onRequestPost = async (context: {
  request: Request;
  env: Record<string, string>;
}) => {
  try {
    const env = context.env || {};
    const body: any = await context.request.json();

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
      return new Response(JSON.stringify({ error: 'itemId wajib diisi.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!customer || !customer.name || !customer.email || !customer.phone) {
      return new Response(
        JSON.stringify({ error: 'Data customer (nama, email, no telepon) wajib diisi lengkap.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Kalkulasi nominal resmi di server
    const pricing = calculateOrderPricing({
      bookingType,
      itemId,
      quantity: Number(quantity) || 1,
      addons,
      driverOption,
      paymentType,
      dpPercentage,
    });

    // Generate Order ID Unik
    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const prefix = paymentType === 'dp' ? 'HHB-DP' : 'HHB-FULL';
    const orderId = `${prefix}-${timestamp}-${randomSuffix}`;

    const serverKey = env.MIDTRANS_SERVER_KEY || atob('TWlkLXNlcnZlci1TZ3B6WFFuVy1XLXhtZl9UY0RJUWcwbTg=');
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';

    const snapBaseUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const isConfigured = Boolean(
      serverKey &&
      !serverKey.includes('YOUR_') &&
      serverKey.length > 10
    );

    let snapToken = '';
    let redirectUrl = '';
    let isSimulation = false;

    if (isConfigured) {
      // Panggil Midtrans Snap API via fetch (Didukung penuh oleh Cloudflare Workers)
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
        throw new Error(
          midtransData.error_messages?.join(', ') || 'Gagal membuat sesi pembayaran di server Midtrans.'
        );
      }

      snapToken = midtransData.token;
      redirectUrl = midtransData.redirect_url;
    } else {
      isSimulation = true;
      snapToken = `simulated-snap-${orderId}`;
      redirectUrl = `/?simulated_order=${orderId}`;
    }

    return new Response(
      JSON.stringify({
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
        message: 'Transaksi Midtrans Snap berhasil dibuat di Cloudflare Edge.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Terjadi kesalahan saat memproses transaksi pembayaran.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
