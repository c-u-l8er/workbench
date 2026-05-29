// Coverage metric — Wilson score-interval lower bound at 95% CI
// (Supervisor spec §6.3, AC #6).
//
// This is the same statistic used by Graphonomous' epistemic-frontier skill.
// Reusing it keeps third-party reasoning consistent across the stack.
//
// Formula (95% CI, z = 1.96):
//   phat   = k / n
//   denom  = 1 + z²/n
//   center = phat + z²/(2n)
//   margin = z * sqrt(phat*(1-phat)/n + z²/(4n²))
//   wilson_lower = (center - margin) / denom

// Match the constant used in the Supervisor spec §6.3 formula exactly.
// (More precise: 1.959963984540054; the spec rounds to 1.96 and tests
// hand-compute against 1.96, so we keep the constant readable.)
export const WILSON_Z_95 = 1.96;

/**
 * Wilson score-interval lower bound for `k` successes in `n` trials at the
 * supplied z-score (defaults to 95% CI).
 *
 * - `n === 0` returns 0 (no evidence → no lower bound)
 * - `k > n` is clamped to `k = n`
 * - `k < 0` is clamped to `k = 0`
 * - Result is clamped to [0, 1] to absorb floating-point noise at the edges.
 */
export function wilsonLowerBound(k: number, n: number, z: number = WILSON_Z_95): number {
  if (!Number.isFinite(k) || !Number.isFinite(n) || !Number.isFinite(z)) {
    throw new Error('wilsonLowerBound: non-finite input');
  }
  if (n <= 0) return 0;
  const kClamped = Math.max(0, Math.min(k, n));
  const phat = kClamped / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  const lower = (center - margin) / denom;
  return Math.max(0, Math.min(1, lower));
}

/**
 * Convenience wrapper: takes a FrontierSnapshot-shaped counter pair and
 * returns the lower bound for `cells_covered / cells_total`.
 */
export function coverageWilsonLower(cells_covered: number, cells_total: number): number {
  return wilsonLowerBound(cells_covered, cells_total);
}
