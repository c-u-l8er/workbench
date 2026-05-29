// Cloudflare Pages Function: /api/llm/openrouter/*
//
// Spec §4.3 + §7.1 — pass-through proxy to https://openrouter.ai/api/v1.
// - Authorization header is forwarded untouched (so the key never lives on this server).
// - No body inspection, no logging.
// - Limits: POST, GET only. Only paths under /api/llm/openrouter/.
// - CORS: same-origin only (Workbench is served from the same domain).
//
// This file exists as a stub for the v0.1 deployment. To deploy on Cloudflare
// Pages, place it at functions/api/llm/openrouter/[[path]].ts when wiring up.

export interface Env {}

const UPSTREAM = 'https://openrouter.ai/api/v1';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, HTTP-Referer'
      }
    });
  }

  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/api\/llm\/openrouter\/?/, '');
  const upstream = `${UPSTREAM}/${sub}${url.search}`;

  // Strip cookies and any header that would leak per-tab state.
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'accept', 'http-referer', 'x-title']) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === 'POST' ? request.body : undefined,
    redirect: 'manual'
  };

  const upstreamRes = await fetch(upstream, init);
  // Pass-through response. Do not log body.
  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('set-cookie');
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders
  });
};

// Pages Function type shim so this file compiles in isolation without
// @cloudflare/workers-types installed in the app subproject. Replace with
// the real import when wiring deploy.
type PagesFunction<E = unknown> = (ctx: {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}) => Response | Promise<Response>;
