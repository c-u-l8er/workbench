// Shared streamable-HTTP MCP proxy helper used by every functions/mcp/<server>.ts
// route. Forwards POST + GET + OPTIONS verbatim, preserves the `mcp-session-id`
// header in both directions, and exposes that header to the browser so the JS
// client can pin its session.
//
// Security boundary: this proxy is intentionally dumb — same-origin from the
// browser, plaintext request, plaintext response. No body inspection, no auth
// of its own. The upstream MCP servers (delegatic-mcp, body-browser-mcp,
// prism-mcp) are public Fly endpoints; calling them is not privileged.

export const MCP_ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);

const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'mcp-session-id'
] as const;

export interface ProxyOptions {
  request: Request;
  /** Full upstream URL, e.g. `https://delegatic-mcp.fly.dev/mcp` */
  upstream: string;
}

export async function proxyMcp({ request, upstream }: ProxyOptions): Promise<Response> {
  if (!MCP_ALLOWED_METHODS.has(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, mcp-session-id',
        'Access-Control-Expose-Headers': 'mcp-session-id'
      }
    });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
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
  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('set-cookie');
  // Ensure the browser can read mcp-session-id when same-origin policy permits.
  resHeaders.set('Access-Control-Expose-Headers', 'mcp-session-id');
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders
  });
}
