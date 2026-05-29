// The substrate's correctness check — a predicate on (Value, Requirements).
// This is L14: when `consume(v, req).ok === true`, v really satisfies req.
//
// A failure list is the report. Each entry is a short string naming which
// invariant refused the value. Workbench surfaces these in the Audit tab.

import type { Phase } from './phase';
import type { Value } from './value';

export interface Requirements {
  /** Refuse if v.topological.beta < beta_min. */
  beta_min?: number;
  /** Refuse if σ is non-empty (set true to require empty). */
  sigma_empty?: boolean;
  /** Refuse if κ is true (set true to require κ = false). */
  forward_only?: boolean;
  /** Refuse if v.temporal.pi does not match this phase. */
  phase?: Phase;
}

export interface ConsumeResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly value: Value;
}

export function consume(v: Value, req: Requirements = {}): ConsumeResult {
  const failures: string[] = [];

  if (req.beta_min !== undefined && v.topological.beta < req.beta_min) {
    failures.push(`β=${roundTo(v.topological.beta, 3)} < ${req.beta_min}`);
  }
  if (req.sigma_empty === true && v.spatial.sigma.size > 0) {
    const tags = [...v.spatial.sigma].sort().join(', ');
    failures.push(`σ has unresolved: {${tags}}`);
  }
  if (req.forward_only === true && v.topological.kappa === true) {
    failures.push('κ=true (feedback)');
  }
  if (req.phase !== undefined && v.temporal.pi !== req.phase) {
    failures.push(`π mismatch: ${v.temporal.pi ?? 'null'} ≠ ${req.phase}`);
  }

  return { ok: failures.length === 0, failures, value: v };
}

function roundTo(x: number, places: number): string {
  const m = Math.pow(10, places);
  return (Math.round(x * m) / m).toString();
}
