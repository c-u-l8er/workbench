// Cloudflare Pages Function: /api/mcp/delegatic
//
// Forwards streamable-HTTP MCP requests to https://delegatic-mcp.fly.dev/mcp.
// Mirrored at dev time by the Vite proxy in vite.config.ts.

import { proxyMcp } from './_helper';

export interface Env {}

export const onRequest: PagesFunction<Env> = ({ request }) =>
  proxyMcp({ request, upstream: 'https://delegatic-mcp.fly.dev/mcp' });

type PagesFunction<E = unknown> = (ctx: {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}) => Response | Promise<Response>;
