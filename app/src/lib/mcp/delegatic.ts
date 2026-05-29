// Thin wrapper over the streamable-HTTP MCP client for delegatic-mcp.
//
// Live tool surface (verified against https://delegatic-mcp.fly.dev/mcp on
// 2026-05-25 — Anubis strips the `delegatic_` Elixir module prefix):
//   put_policy / get_policy / list_policies / delete_policy
//   authorize  / verify
//
// Default endpoint is the same-origin proxy at /api/mcp/delegatic, mirrored
// by Vite (dev) and a Cloudflare Pages Function (prod). The browser never
// learns the upstream Fly origin, which sidesteps CORS edge cases.

import { callTool, initSession, type McpSession } from './client';

export const DELEGATIC_DEFAULT_ENDPOINT = '/api/mcp/delegatic';

export interface AuthorizationBlock {
  policy_id: string;
  approved_by: string;
  approved_at: string;
  expires_at: string;
  authorization_token: string;
}

export async function connect(endpoint = DELEGATIC_DEFAULT_ENDPOINT): Promise<McpSession> {
  return initSession({ endpoint, clientName: 'workbench:delegatic' });
}

export interface AuthorizeArgs {
  action_type: string;
  policy_id: string;
  agent_id: string;
  approved_by: string;
  ttl_seconds?: number;
}
export interface AuthorizeResult {
  status: 'ok';
  authorization_block: AuthorizationBlock;
}
export function authorize(sess: McpSession, args: AuthorizeArgs) {
  return callTool<AuthorizeResult>(sess, 'authorize', args as unknown as Record<string, unknown>);
}

export interface VerifyResult {
  status: 'ok';
  verified: boolean;
  reason?: string;
}
export function verify(sess: McpSession, block: AuthorizationBlock | string) {
  // The MCP tool accepts the block as a JSON string per its schema.
  const authorization_block = typeof block === 'string' ? block : JSON.stringify(block);
  return callTool<VerifyResult>(sess, 'verify', { authorization_block });
}

export interface PutPolicyArgs {
  policy_id: string;
  /** JSON-encoded array of allowed action types, e.g. `["shell_exec"]` */
  allow_actions?: string;
  /** JSON-encoded array of denied action types */
  deny_actions?: string;
  /** JSON-encoded array of agent ids; omit for any agent */
  agents?: string;
  /** JSON-encoded array of required-approver ids */
  require_approval_by?: string;
  max_ttl_seconds?: number;
  description?: string;
}
export function putPolicy(sess: McpSession, args: PutPolicyArgs) {
  return callTool(sess, 'put_policy', args as unknown as Record<string, unknown>);
}
export function getPolicy(sess: McpSession, policy_id: string) {
  return callTool(sess, 'get_policy', { policy_id });
}
export function listPolicies(sess: McpSession) {
  return callTool(sess, 'list_policies', {});
}
export function deletePolicy(sess: McpSession, policy_id: string) {
  return callTool(sess, 'delete_policy', { policy_id });
}
