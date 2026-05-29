// Thin wrapper over the streamable-HTTP MCP client for prism-mcp.
//
// Live endpoint verified 2026-05-25 at https://prism.opensentience.org/mcp
// (also reachable at https://prism-eval.fly.dev/mcp). Anubis exposes six
// loop-phase machines, each multiplexed by an `action` discriminator.
//
// The Workbench's `Send to PRISM` flow uses `config.list_systems` to confirm
// connectivity and the public HTTP `/api/leaderboard` for the visible
// rankings. Bulk EvidenceBundle ingest is a v0.3 PRISM-side feature; for
// now the Workbench surfaces the content_hash so future ingest is stable.

import { callTool, initSession, type McpSession } from './client';

export const PRISM_DEFAULT_ENDPOINT = '/api/mcp/prism';
export const PRISM_LEADERBOARD_URL = 'https://prism.opensentience.org/api/leaderboard';

export interface PrismSystem {
  id: string;
  name: string;
  display_name?: string;
  transport: string;
  mcp_endpoint: string;
}

export async function connect(endpoint = PRISM_DEFAULT_ENDPOINT): Promise<McpSession> {
  return initSession({ endpoint, clientName: 'workbench:prism' });
}

export function config(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'config', args as unknown as Record<string, unknown>);
}
export function compose(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'compose', args as unknown as Record<string, unknown>);
}
export function interact(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'interact', args as unknown as Record<string, unknown>);
}
export function observe(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'observe', args as unknown as Record<string, unknown>);
}
export function reflect(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'reflect', args as unknown as Record<string, unknown>);
}
export function diagnose(sess: McpSession, args: { action: string; [k: string]: unknown }) {
  return callTool(sess, 'diagnose', args as unknown as Record<string, unknown>);
}

export async function listSystems(sess: McpSession): Promise<PrismSystem[]> {
  const r = (await config(sess, { action: 'list_systems' })) as { status: string; result: PrismSystem[] };
  return r.result;
}

export interface LeaderboardRow {
  system: string;
  version: string;
  composite: number;
  rank: number;
  dims: Record<string, number>;
  loop_closure_rate?: number;
}
export interface Leaderboard {
  cycle: number;
  rows: LeaderboardRow[];
}

// Leaderboard is fetched from the same proxy origin to avoid CORS surprises.
// /api/prism/leaderboard mirrors /api/leaderboard on the PRISM server.
export const PRISM_LEADERBOARD_PROXY = '/api/prism/leaderboard';

export async function fetchLeaderboard(url = PRISM_LEADERBOARD_PROXY): Promise<Leaderboard> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
  return res.json() as Promise<Leaderboard>;
}
