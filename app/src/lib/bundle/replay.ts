// SkillBundle replay engine. v0.1 deterministic, in-browser.
//
// Port of OS-011 §5.4 fail-fast replay semantics (BodyBrowser.Replay.execute/3):
//   1. For each recorded edge, attempt the same tool call.
//   2. Compare the observed state_hash to the recorded one.
//   3. On mismatch, halt and record a SurpriseSignal of kind state_hash_mismatch.
//   4. On policy_deny or model_refusal mid-trace, halt and record the kind.
//   5. Return a ReplayReport with status/halted_at_edge/fidelity_level.
//
// v0.1 supports the simulator body only (no real MCP side effects on replay).
// Real-body replay (browser/host) is gated behind a fidelity_level=structural
// mode that records but does not require state_hash equality.

import { v4 as uuid } from 'uuid';
import { canonicalize, sha256Hex } from '../hash';
import { projectSurprise } from '../ia/surprise';
import type { ReplayReport, FidelityLevel, SkillBundle } from '../types';

export interface ReplayArgs {
  bundle: SkillBundle;
  input?: Record<string, unknown>;
  mode?: 'exact' | 'structural';
  model_used?: string;
  evidence_bundle_id?: string;
  // For v0.1 the executor is a pure function: given a tool_call, return an observation.
  // This abstracts over simulator vs real body; tests pass a deterministic stub.
  executeStep: (
    edgeIndex: number,
    toolCall: { server: string; name: string; arguments: Record<string, unknown> } | undefined
  ) => Promise<{ observation: unknown }>;
}

export async function replayBundle(args: ReplayArgs): Promise<ReplayReport> {
  const edges = args.bundle.interaction_trace.edges as Array<Record<string, unknown>>;
  const started_at = new Date().toISOString();
  const mode = args.mode ?? 'exact';
  const surprises: ReplayReport['surprise_signals'] = [];

  let attempted = 0;
  let committed = 0;
  let halted_at_edge: number | null = null;
  let hashes_compared = 0;

  for (let i = 0; i < edges.length; i++) {
    attempted++;
    const recorded = edges[i];
    const tool_call = recorded.tool_call as
      | { server: string; name: string; arguments: Record<string, unknown> }
      | undefined;

    let observation: unknown;
    try {
      const r = await args.executeStep(i, tool_call);
      observation = r.observation;
    } catch (err) {
      surprises.push({
        edge_index: i,
        kind: 'model_refusal',
        detail: err instanceof Error ? err.message : String(err),
        ...projectSurprise('model_refusal')
      });
      halted_at_edge = i;
      break;
    }

    const recorded_hash = recorded.state_hash as string | undefined;
    const observed_hash = observation === undefined ? undefined : 'sha256:' + (await sha256Hex(canonicalize(observation)));

    if (recorded_hash && observed_hash) {
      hashes_compared++;
      if (mode === 'exact' && recorded_hash !== observed_hash) {
        surprises.push({
          edge_index: i,
          kind: 'state_hash_mismatch',
          detail: `expected ${recorded_hash} got ${observed_hash}`,
          ...projectSurprise('state_hash_mismatch')
        });
        halted_at_edge = i;
        break;
      }
    }
    committed++;
  }

  const ended_at = new Date().toISOString();
  const status: ReplayReport['status'] =
    halted_at_edge !== null
      ? 'halted_at_edge_N'
      : surprises.length > 0
      ? 'completed_with_surprises'
      : 'success';

  const fidelity = edges.length === 0 ? 1 : committed / edges.length;
  // Exact fidelity requires (a) exact mode (b) zero surprises (c) at least one
  // hash actually compared. A bundle with all state_hash fields stripped (e.g.
  // after redaction) replays structurally — the walk succeeded, but byte-
  // equivalence was not verified.
  const fidelity_level: FidelityLevel =
    status === 'halted_at_edge_N'
      ? 'failed'
      : mode === 'exact' && surprises.length === 0 && hashes_compared > 0
      ? 'exact'
      : 'structural';

  return {
    replay_id: uuid(),
    skill_id: args.bundle.skill_id,
    skill_version: args.bundle.skill_version,
    input: args.input ?? {},
    started_at,
    ended_at,
    edges_attempted: attempted,
    edges_committed: committed,
    status,
    halted_at_edge,
    surprise_signals: surprises,
    fidelity,
    fidelity_level,
    model_used: args.model_used ?? 'unknown',
    cost_usd: null,
    evidence_bundle_id: args.evidence_bundle_id ?? args.bundle.bundle_id
  };
}
