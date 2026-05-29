// Thin wrapper over the streamable-HTTP MCP client for body-os-mcp.
// OS-011 host-substrate body — file/process scope, NOT used in v0.1 browser flows.
// Included for capability declaration completeness so SkillBundles that reference
// &body.os can be authored, even if they never execute in-browser.

import { callTool, initSession, type McpSession } from './client';

export const BODY_OS_DEFAULT_ENDPOINT = 'https://body-os-mcp.fly.dev/mcp';

export async function connect(endpoint = BODY_OS_DEFAULT_ENDPOINT): Promise<McpSession> {
  return initSession({ endpoint, clientName: 'workbench:body-os' });
}

export function perceive(sess: McpSession, args: Record<string, unknown> = {}) {
  return callTool(sess, 'perceive', args);
}

export function act(sess: McpSession, args: Record<string, unknown>) {
  return callTool(sess, 'act', args);
}

export function observe(sess: McpSession, args: Record<string, unknown> = {}) {
  return callTool(sess, 'observe', args);
}

export function authorize(sess: McpSession, args: Record<string, unknown>) {
  return callTool(sess, 'authorize', args);
}
