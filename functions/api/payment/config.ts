// Cloudflare Pages Functions: GET /api/payment/config
import { USD_TO_IDR_RATE } from '../../../src/services/pricingEngine';

export const onRequestGet = async (context: { env: Record<string, string> }) => {
  const env = context.env || {};
  const clientKey = env.MIDTRANS_CLIENT_KEY || 'Mid-client-fHdtxHc9aBZ7eZi1';
  const merchantId = env.MIDTRANS_MERCHANT_ID || 'M967161571';
  const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';

  const snapJsUrl = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  return new Response(
    JSON.stringify({
      clientKey,
      merchantId,
      isProduction,
      isConfigured: Boolean(clientKey),
      snapJsUrl,
      defaultDpPercentage: 30,
      usdToIdrRate: USD_TO_IDR_RATE,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};
