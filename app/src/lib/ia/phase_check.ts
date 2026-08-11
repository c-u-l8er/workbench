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
import { phaseIndex, phaseLeq, type Phase } from './phase';
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
 * Splits a trace into cycles and runs `chain` across consecutive edges within
 * each cycle. Returns every backward phase transition observed.
 *
 * Two kinds of boundary, and the second one matters:
 *
 *  1. A `user_message` — a new instruction restarts the loop.
 *  2. **Feedback followed by a step that is not after it.** An `observe` edge
 *     is `learn`: the loop closed because a result came back. The next
 *     `act` is the next turn of the loop, not a step backwards inside this
 *     one.
 *
 * Without (2) this checker was unusable on any real agent trace. A Claude Code
 * turn is `act, observe, act, observe, …`, so every second transition read as
 * a `learn → act` violation — 124 of them on a 124-tool-call segment, and
 * every violation on every segment was that same transition. A check that
 * fires uniformly on correct input is measuring its own segmentation, not the
 * trace. See `workbench/docs/INGEST_SPIKE.md` §4.
 *
 * The narrowness is the point: only a phase at or past `learn` opens a new
 * cycle. `act → route` — authorizing something after already doing it — has
 * no feedback edge in front of it, stays inside the cycle, and is still
 * reported. That is the class of defect this check exists to catch.
 */
export function checkPhaseOrder(trace: InteractionTrace): PhaseCheckResult {
  const edges = trace.edges;
  if (edges.length === 0) {
    return { cycles: 0, edges_examined: 0, violations: [], ok: true };
  }

  const cycles: TraceEdge[][] = [];
  let current: TraceEdge[] = [];
  let prevPhase: Phase | null = null;

  for (const e of edges) {
    const phase = edgeToPhase(e.kind);
    const restart = e.kind === 'user_message';
    // The loop came back around: feedback arrived, and the next step is not
    // after it. `phaseLeq` is the same ordering `chain` refuses on.
    const reentry =
      prevPhase !== null &&
      phaseIndex(prevPhase) >= phaseIndex('learn') &&
      !phaseLeq(prevPhase, phase);

    if ((restart || reentry) && current.length > 0) {
      cycles.push(current);
      current = [];
    }
    current.push(e);
    prevPhase = phase;
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
