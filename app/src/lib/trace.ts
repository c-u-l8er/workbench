// InteractionTrace builder. Edges describe one observable agent step:
//   { index, ts, kind, capability?, tool_call?, observation?, state_hash?, surprise? }
//
// state_hash is computed from the observation payload so that replay can
// detect drift (spec §5.1 + §15.1 gate.replay_fidelity).

import { v4 as uuid } from 'uuid';
import { canonicalize, sha256Hex } from './hash';

export type TraceEdgeKind =
  | 'perceive'
  | 'act'
  | 'observe'
  | 'authorize'
  | 'llm_call'
  | 'mcp_call'
  | 'user_message'
  | 'assistant_message';

export interface TraceEdge {
  index: number;
  ts: string;
  kind: TraceEdgeKind;
  capability?: string;
  tool_call?: { server: string; name: string; arguments: Record<string, unknown> };
  observation?: unknown;
  state_hash?: string;
  surprise?: { kind: string; detail?: string };
}

export interface InteractionTrace {
  trace_id: string;
  started_at: string;
  edges: TraceEdge[];
}

export function newTrace(): InteractionTrace {
  return { trace_id: uuid(), started_at: new Date().toISOString(), edges: [] };
}

export async function appendEdge(
  trace: InteractionTrace,
  edge: Omit<TraceEdge, 'index' | 'ts' | 'state_hash'> & { observation?: unknown }
): Promise<TraceEdge> {
  const index = trace.edges.length;
  const ts = new Date().toISOString();
  const state_hash =
    edge.observation !== undefined
      ? 'sha256:' + (await sha256Hex(canonicalize(edge.observation as unknown)))
      : undefined;
  const full: TraceEdge = { index, ts, state_hash, ...edge };
  trace.edges.push(full);
  return full;
}
