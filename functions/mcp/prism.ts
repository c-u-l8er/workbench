// Cloudflare Pages Function: /api/mcp/prism
//
// Forwards streamable-HTTP MCP requests to https://prism-mcp.fly.dev/mcp.
// Mirrored at dev time by the Vite proxy in vite.config.ts.

import { proxyMcp } from './_helper';

export interface Env {}

export const onRequest: PagesFunction<Env> = ({ request }) =>
  proxyMcp({ request, upstream: 'https://prism.opensentience.org/mcp' });

type PagesFunction<E = unknown> = (ctx: {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}) => Response | Promise<Response>;
