// Streamable-HTTP MCP client. Mirrors FleetPrompt's GraphonomousClient.HTTP
// handshake (STACK_COMPLETION.md 2026-04-24 entry):
//   initialize -> notifications/initialized -> tools/call
// with mcp-session-id propagation and SSE-envelope parsing.
//
// v0.1 scope: enough surface to call act/retrieve/authorize/perceive/observe.

export interface McpInitOpts {
  endpoint: string; // e.g. https://graphonomous-mcp.fly.dev/mcp
  clientName?: string;
}

export interface McpSession {
  endpoint: string;
  sessionId: string;
  initialized: boolean;
}

interface JsonRpcReq {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcRes<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let nextId = 1;

async function rpc<T = unknown>(
  sess: McpSession,
  method: string,
  params?: unknown
): Promise<T> {
  const req: JsonRpcReq = { jsonrpc: '2.0', id: nextId++, method, params };
  const res = await fetch(sess.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-session-id': sess.sessionId
    },
    body: JSON.stringify(req)
  });
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}`);

  const ct = res.headers.get('content-type') ?? '';
  let body: JsonRpcRes<T>;
  if (ct.includes('text/event-stream')) {
    // Parse SSE: first 'data: { ... }' frame is the JSON-RPC response
    const text = await res.text();
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) throw new Error(`MCP ${method} empty SSE`);
    body = JSON.parse(dataLine.slice(6));
  } else {
    body = await res.json();
  }
  if (body.error) throw new Error(`MCP ${method}: ${body.error.message}`);
  return body.result as T;
}

export async function initSession(opts: McpInitOpts): Promise<McpSession> {
  // Step 1: initialize
  const initReq: JsonRpcReq = {
    jsonrpc: '2.0',
    id: nextId++,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: opts.clientName ?? 'workbench', version: '0.1.0' }
    }
  };
  const initRes = await fetch(opts.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(initReq)
  });
  if (!initRes.ok) throw new Error(`MCP initialize HTTP ${initRes.status}`);
  const sessionId = initRes.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('MCP initialize: server did not return mcp-session-id');

  const sess: McpSession = { endpoint: opts.endpoint, sessionId, initialized: false };

  // Step 2: notifications/initialized (no response expected)
  await fetch(opts.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  });

  sess.initialized = true;
  return sess;
}

// MCP `tools/call` envelope returned by Anubis-based servers. The actual tool
// payload lives in `structuredContent` (preferred — typed JSON) or, as a
// fallback, in `content[0].text` (a JSON-encoded string). We always prefer
// structuredContent when present; callers see the unwrapped object.
interface McpToolCallEnvelope {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export async function callTool<T = unknown>(
  sess: McpSession,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const env = await rpc<McpToolCallEnvelope>(sess, 'tools/call', { name, arguments: args });
  if (env.isError) {
    const msg = env.content?.[0]?.text ?? `tools/call ${name} returned isError`;
    throw new Error(msg);
  }
  if (env.structuredContent !== undefined) return env.structuredContent as T;
  const text = env.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
  return env as unknown as T;
}
