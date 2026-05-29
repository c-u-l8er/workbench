import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5180,
    strictPort: false,
    fs: {
      // Allow loading fixture scenarios from ../fixtures/ at build time
      // via import.meta.glob. The fixtures dir is referenced by the spec
      // as the authoritative location; duplicating into static/ would drift.
      allow: ['..']
    },
    proxy: {
      // Dev-only mirror of the Cloudflare Pages Function at functions/llm/openrouter.ts.
      // Same path, same headers, same upstream. Authorization is forwarded untouched.
      '/api/llm/openrouter': {
        target: 'https://openrouter.ai/api/v1',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/llm\/openrouter/, '')
      },
      // v0.2 MCP server proxies — mirror functions/mcp/<server>.ts CF Pages Functions.
      // Each forwards the full MCP JSON-RPC + streamable-HTTP handshake (POST + SSE)
      // to the upstream Fly.io endpoint. The browser talks to the same origin so we
      // sidestep CORS and keep the public surface to a single domain.
      '/api/mcp/delegatic': {
        target: 'https://delegatic-mcp.fly.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mcp\/delegatic/, '/mcp')
      },
      '/api/mcp/body-browser': {
        target: 'https://body-browser-mcp.fly.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mcp\/body-browser/, '/mcp')
      },
      '/api/mcp/prism': {
        target: 'https://prism.opensentience.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mcp\/prism/, '/mcp')
      },
      // PRISM's public read-only leaderboard JSON (HTTP, not MCP). Same-origin
      // proxy lets us render it without a CORS preflight from any browser.
      '/api/prism/leaderboard': {
        target: 'https://prism.opensentience.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/prism\/leaderboard/, '/api/leaderboard')
      }
    }
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
