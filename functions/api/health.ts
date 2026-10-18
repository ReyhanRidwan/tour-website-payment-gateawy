// Cloudflare Pages Functions: GET /api/health
export const onRequestGet = async (context: { env: Record<string, string> }) => {
  const env = context.env || {};
  const serverKey = env.MIDTRANS_SERVER_KEY || '';
  const merchantId = env.MIDTRANS_MERCHANT_ID || '';
  const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.startsWith('re_'));

  const isConfigured = Boolean(
    serverKey &&
    !serverKey.includes('YOUR_') &&
    serverKey.length > 10
  );

  return new Response(
    JSON.stringify({
      status: 'ok',
      platform: 'Cloudflare Pages Functions (Edge Serverless)',
      midtrans: {
        configured: isConfigured,
        environment: isProduction ? 'production' : 'sandbox',
        merchantId: merchantId || 'not_set',
      },
      emailService: {
        provider: hasResend ? 'Resend API (Active)' : 'Simulation / Unconfigured',
      },
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};
