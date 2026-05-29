// The four unary operations on Value — the named L-specific "inverses" that
// turn a `consume` refusal into a recovery path.
//
//   promote     — β-monotone        (L10)   raises confidence
//   reconcile   — σ-antitone, idempotent (L11, L13)  shrinks the conflict set
//   deliberate  — κ-antitone, idempotent (L12)  clears feedback
//   cycle       — sets κ to true            models output reused as input

import type { Value } from './value';

export interface PromoteOpts {
  /** Explicit target. β is set to max(current, raises_to). */
  raises_to?: number;
  /** Additive bump (clamped to 1.0). β is set to max(current, current + by). */
  by?: number;
}

export function promote(v: Value, opts: PromoteOpts = {}): Value {
  let target: number;
  if (opts.raises_to !== undefined) {
    target = opts.raises_to;
  } else if (opts.by !== undefined) {
    target = Math.min(1.0, v.topological.beta + opts.by);
  } else {
    target = Math.min(1.0, v.topological.beta + 0.3);
  }
  const newBeta = Math.max(v.topological.beta, target);
  return {
    ...v,
    topological: { ...v.topological, beta: newBeta }
  };
}

/** Remove `tags` from σ. Idempotent; antitone (result σ ⊆ input σ). */
export function reconcile(v: Value, tags: Iterable<string>): Value {
  const drop = new Set(tags);
  const sigma = new Set<string>();
  for (const t of v.spatial.sigma) {
    if (!drop.has(t)) sigma.add(t);
  }
  return { ...v, spatial: { sigma } };
}

/** Clear κ — the substrate's record of feedback being retired. */
export function deliberate(v: Value): Value {
  return {
    ...v,
    topological: { ...v.topological, kappa: false }
  };
}

/** Set κ to true. Used to model an output reused as input. */
export function cycle(v: Value): Value {
  return {
    ...v,
    topological: { ...v.topological, kappa: true }
  };
}
