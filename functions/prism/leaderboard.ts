// Cloudflare Pages Function: /api/prism/leaderboard
//
// Same-origin proxy for PRISM's public read-only leaderboard JSON.
// Avoids cross-origin nuisances on browsers that preflight even simple GETs.

export interface Env {}

const UPSTREAM = 'https://prism.opensentience.org/api/leaderboard';

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      }
    });
  }
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

  const upstreamRes = await fetch(UPSTREAM);
  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('set-cookie');
  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
};

type PagesFunction<E = unknown> = (ctx: {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}) => Response | Promise<Response>;
