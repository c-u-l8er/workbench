// Thin wrapper over the streamable-HTTP MCP client for body-browser-mcp.
// OS-011 Embodiment Protocol body — perceive / affordances / encode_state /
// act / dry_run / replay.
//
// Tool surface verified against https://body-browser-mcp.fly.dev/mcp on
// 2026-05-25. The default backend is the Simulator (about:blank, no a11y
// nodes); replacing it with the real Chromium / agent-browser backend is a
// server-side change and requires no client adjustments.

import { callTool, initSession, type McpSession } from './client';

export const BODY_BROWSER_DEFAULT_ENDPOINT = '/api/mcp/body-browser';

export interface Observation {
  perceived_at: string;
  subtype: string;
  title?: string;
  url?: string;
  a11y_tree: unknown[];
  refs_generation: number;
  viewport?: { width: number; height: number; device_pixel_ratio?: number };
}

export interface AffordanceSet {
  actions: Array<{ ref?: string; kind?: string; [k: string]: unknown }>;
  policy_filtered_out?: unknown[];
  policy_filtered_out_count?: number;
  refs_generation: number;
}

export interface PerceiveResult { status: 'ok'; observation: Observation }
export interface AffordancesResult { status: 'ok'; affordance_set: AffordanceSet }
export interface EncodeStateResult { status: 'ok'; state_hash: string }
export interface ActResult {
  status: 'ok' | 'denied';
  state_hash_before?: string;
  state_hash_after?: string;
  success?: boolean;
  side_effects?: string[];
  reason?: string;
}

export interface TypedAction {
  kind: string;
  ref?: string;
  payload?: Record<string, unknown>;
  authorization?: Record<string, unknown>;
}

export async function connect(endpoint = BODY_BROWSER_DEFAULT_ENDPOINT): Promise<McpSession> {
  return initSession({ endpoint, clientName: 'workbench:body-browser' });
}

export function ensureSession(sess: McpSession, session_id: string) {
  return callTool(sess, 'ensure_session', { session_id });
}

export function perceive(sess: McpSession, session_id: string) {
  return callTool<PerceiveResult>(sess, 'perceive', { session_id });
}

export function affordances(sess: McpSession, session_id: string) {
  return callTool<AffordancesResult>(sess, 'affordances', { session_id });
}

export function encodeState(sess: McpSession, session_id: string) {
  return callTool<EncodeStateResult>(sess, 'encode_state', { session_id });
}

export function act(sess: McpSession, session_id: string, action: TypedAction) {
  return callTool<ActResult>(sess, 'act', { session_id, typed_action: JSON.stringify(action) });
}

export function dryRun(sess: McpSession, session_id: string, action: TypedAction) {
  return callTool(sess, 'dry_run', { session_id, typed_action: JSON.stringify(action) });
}

export function replay(sess: McpSession, args: {
  session_id: string;
  interaction_trace: unknown;
  mode?: 'exact' | 'structural' | 'semantic';
}) {
  return callTool(sess, 'replay', {
    session_id: args.session_id,
    interaction_trace: typeof args.interaction_trace === 'string'
      ? args.interaction_trace
      : JSON.stringify(args.interaction_trace),
    mode: args.mode
  });
}
