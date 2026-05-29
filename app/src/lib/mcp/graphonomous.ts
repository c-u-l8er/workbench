// Thin wrapper over the streamable-HTTP MCP client for graphonomous-mcp.
// v0.4 surface: retrieve / route / act / learn / consolidate.

import { callTool, initSession, type McpSession } from './client';

export const GRAPHONOMOUS_DEFAULT_ENDPOINT = 'https://graphonomous-mcp.fly.dev/mcp';

export async function connect(endpoint = GRAPHONOMOUS_DEFAULT_ENDPOINT): Promise<McpSession> {
  return initSession({ endpoint, clientName: 'workbench:graphonomous' });
}

export function retrieve(sess: McpSession, args: { action: string; query?: string; [k: string]: unknown }) {
  return callTool(sess, 'retrieve', args);
}

export function route(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'route', args);
}

export function act(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'act', args);
}

export function learn(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'learn', args);
}

export function consolidate(sess: McpSession, args: { action: string; [k: string]: unknown } = { action: 'run' }) {
  return callTool(sess, 'consolidate', args);
}
