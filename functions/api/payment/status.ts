// Cloudflare Pages Functions: GET /api/payment/status
import { resolveMidtransStatus } from '../../../src/services/pricingEngine';

export const onRequestGet = async (context: {
  request: Request;
  env: Record<string, string>;
}) => {
  try {
    const env = context.env || {};
    const url = new URL(context.request.url);

    // Ekstrak orderId dari query parameter atau URL path
    const pathParts = url.pathname.split('/').filter(Boolean);
    const orderId =
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

    if (!serverKey || serverKey.length <= 10) {
      return new Response(
        JSON.stringify({ error: 'Kunci MIDTRANS_SERVER_KEY belum terpasang di Cloudflare.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
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
      return new Response(
        JSON.stringify({ success: false, error: 'Data transaksi tidak ditemukan di Midtrans' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const statusData = (await midtransRes.json()) as any;
    const paymentType: 'dp' | 'full' = orderId.startsWith('HHB-DP') ? 'dp' : 'full';
    const { status: resolvedStatus } = resolveMidtransStatus(
      statusData.transaction_status,
      statusData.fraud_status,
      paymentType
    );

    return new Response(
      JSON.stringify({
        success: true,
        record: {
          orderId,
          status: resolvedStatus,
          rawStatus: statusData.transaction_status,
          grossAmount: statusData.gross_amount,
          paymentType: statusData.payment_type,
          transactionTime: statusData.transaction_time,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Gagal mengecek status transaksi.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
