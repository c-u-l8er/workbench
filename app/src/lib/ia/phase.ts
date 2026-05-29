// The five canonical PULSE phases — a totally ordered poset that grades
// composition via `chain`. Mirrors `InvariantArithmetic.Phase` (Elixir).

export type Phase = 'retrieve' | 'route' | 'act' | 'learn' | 'consolidate';

export const PHASES: readonly Phase[] = [
  'retrieve',
  'route',
  'act',
  'learn',
  'consolidate'
] as const;

/** Zero-based index of a phase in canonical order; `null`/`undefined` → -1. */
export function phaseIndex(p: Phase | null | undefined): number {
  if (p == null) return -1;
  return PHASES.indexOf(p);
}

/**
 * True when `a` may legally precede `b` in `chain`. Either side may be
 * `null` (no phase commitment) — always OK. Otherwise `a ≤ b` in canonical
 * order.
 */
export function phaseLeq(
  a: Phase | null | undefined,
  b: Phase | null | undefined
): boolean {
  if (a == null || b == null) return true;
  return phaseIndex(a) <= phaseIndex(b);
}
