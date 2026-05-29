// Phase-graded composition. Defined only when phase(a) ≤ phase(b).
//
// Objects of the category PHASE are the five PULSE phases. Morphisms are
// values labeled with an entry/exit phase. `chain` is composition.
// Backward composition is not a morphism — `chain` refuses it.

import { combine } from './combine';
import { phaseLeq, type Phase } from './phase';
import type { Value } from './value';

export interface PhaseViolation {
  readonly kind: 'phase_violation';
  readonly invariant: 'pi';
  readonly from: Phase | null;
  readonly to: Phase | null;
  readonly message: string;
}

export type ChainResult =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly violation: PhaseViolation };

function firstNonNil<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a != null) return a;
  if (b != null) return b;
  return null;
}

export function chain(a: Value, b: Value): ChainResult {
  if (!phaseLeq(a.temporal.pi, b.temporal.pi)) {
    return {
      ok: false,
      violation: {
        kind: 'phase_violation',
        invariant: 'pi',
        from: a.temporal.pi,
        to: b.temporal.pi,
        message: `π violation: ${b.temporal.pi ?? 'null'} cannot follow ${a.temporal.pi ?? 'null'}`
      }
    };
  }

  const merged = combine(a, b);
  const exitPi = firstNonNil(b.temporal.pi, a.temporal.pi);

  return {
    ok: true,
    value: {
      ...merged,
      temporal: { ...merged.temporal, pi: exitPi }
    }
  };
}

export class PhaseViolationError extends Error {
  readonly from: Phase | null;
  readonly to: Phase | null;
  readonly invariant = 'pi' as const;

  constructor(v: PhaseViolation) {
    super(v.message);
    this.name = 'PhaseViolationError';
    this.from = v.from;
    this.to = v.to;
  }
}

/** Throwing variant — useful in trace builders where a backward phase is a bug. */
export function chainOrThrow(a: Value, b: Value): Value {
  const r = chain(a, b);
  if (!r.ok) throw new PhaseViolationError(r.violation);
  return r.value;
}
