// Cloudflare Pages Functions Global Middleware (CORS & Security Headers)
export const onRequest = async (context: any) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
};
