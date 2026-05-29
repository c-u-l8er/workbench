// M6 — trace phase-order validation via IA `chain`.
//
// An InteractionTrace is a linear sequence of edges (one observable agent
// step per edge). PULSE assigns each step to one of five phases:
//   retrieve → route → act → learn → consolidate
// IA's `chain` operation composes Values only when their entry/exit phases
// respect that order (phase(a) ≤ phase(b)). A trace is "phase-monotone"
// within a single cognitive cycle if no backward phase transitions occur.
//
// Most conversational traces have multiple cycles: each new `user_message`
// resets the cycle back to `retrieve`. So this checker segments at
// user_message boundaries and validates monotonicity within each cycle.

import { chain } from './chain';
import { newValue } from './value';
import type { Phase } from './phase';
import type { TraceEdge, TraceEdgeKind, InteractionTrace } from '../trace';

/**
 * Maps each TraceEdgeKind to its canonical PULSE phase. The mapping reflects
 * what the edge *does* to the loop state:
 *   - user_message, perceive (and the misspelled 'perception' still used in
 *     teach), authorize → retrieve / route (inputs and decisions)
 *   - llm_call, mcp_call, act, assistant_message → act
 *   - observe → learn (downstream feedback)
 *
 * Unknown kinds map to `null` (no phase commitment — `chain` treats null as
 * "always OK", which is the conservative interpretation).
 */
export function edgeToPhase(kind: TraceEdgeKind | string): Phase | null {
  switch (kind) {
    case 'user_message':
    case 'perceive':
    case 'perception': // tolerated alias — teach flow emits this
      return 'retrieve';
    case 'authorize':
      return 'route';
    case 'llm_call':
    case 'mcp_call':
    case 'act':
    case 'assistant_message':
      return 'act';
    case 'observe':
      return 'learn';
    default:
      return null;
  }
}

export interface PhaseViolationReport {
  cycle_index: number;
  from_edge_index: number;
  to_edge_index: number;
  from_phase: Phase | null;
  to_phase: Phase | null;
  message: string;
}

export interface PhaseCheckResult {
  cycles: number;
  edges_examined: number;
  violations: PhaseViolationReport[];
  ok: boolean;
}

/**
 * Splits a trace into cycles at every `user_message` boundary and runs
 * `chain` across consecutive edges within each cycle. Returns every backward
 * phase transition observed.
 */
export function checkPhaseOrder(trace: InteractionTrace): PhaseCheckResult {
  const edges = trace.edges;
  if (edges.length === 0) {
    return { cycles: 0, edges_examined: 0, violations: [], ok: true };
  }

  // Segment by user_message boundaries. The first edge always starts a cycle.
  const cycles: TraceEdge[][] = [];
  let current: TraceEdge[] = [];
  for (const e of edges) {
    if (e.kind === 'user_message' && current.length > 0) {
      cycles.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) cycles.push(current);

  const violations: PhaseViolationReport[] = [];
  for (let ci = 0; ci < cycles.length; ci++) {
    const cyc = cycles[ci];
    let prev: { value: ReturnType<typeof newValue>; edgeIndex: number; phase: Phase | null } | null = null;
    for (const e of cyc) {
      const phase = edgeToPhase(e.kind);
      const v = newValue(0, { pi: phase ?? null });
      if (prev) {
        const r = chain(prev.value, v);
        if (!r.ok) {
          violations.push({
            cycle_index: ci,
            from_edge_index: prev.edgeIndex,
            to_edge_index: e.index,
            from_phase: prev.phase,
            to_phase: phase,
            message: r.violation.message
          });
        }
      }
      prev = { value: v, edgeIndex: e.index, phase };
    }
  }

  return {
    cycles: cycles.length,
    edges_examined: edges.length,
    violations,
    ok: violations.length === 0
  };
}
