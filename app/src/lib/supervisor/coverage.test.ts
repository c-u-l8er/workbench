// Coverage tests — Supervisor spec AC #6 (Wilson lower bound matches a
// hand-computed value within 1e-6).

import { describe, it, expect } from 'vitest';
import { wilsonLowerBound, coverageWilsonLower, WILSON_Z_95 } from './coverage';

// Hand-computed reference values (z = 1.96 exactly, 95% CI) — Wilson score
// interval lower bound, formula from Supervisor spec §6.3. Worked out
// long-hand and cross-checked against the implementation; the textbook
// "1.96-rounded" values differ from the "precise-z" textbook values in the
// 4th–7th decimal, so we lock the test to the exact z=1.96 form the spec
// publishes.
const REFERENCE: Array<{ k: number; n: number; expected: number; label: string }> = [
  { k: 0,  n: 10, expected: 0.0,                 label: '0/10 → 0' },
  { k: 2,  n: 10, expected: 0.05668094798069332, label: '2/10 ≈ 0.0567' },
  { k: 5,  n: 10, expected: 0.2365895936154873,  label: '5/10 ≈ 0.2366' },
  { k: 10, n: 10, expected: 0.7224598312333834,  label: '10/10 ≈ 0.7225' },
  { k: 1,  n: 1,  expected: 0.20654329147389294, label: '1/1 ≈ 0.2065' }
];

describe('wilsonLowerBound — AC #6', () => {
  for (const { k, n, expected, label } of REFERENCE) {
    it(`${label}`, () => {
      const got = wilsonLowerBound(k, n);
      expect(got).toBeCloseTo(expected, 6);
    });
  }

  it('returns 0 for n = 0', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('clamps k > n', () => {
    expect(wilsonLowerBound(11, 10)).toBeCloseTo(wilsonLowerBound(10, 10), 12);
  });

  it('clamps k < 0', () => {
    expect(wilsonLowerBound(-1, 10)).toBeCloseTo(wilsonLowerBound(0, 10), 12);
  });

  it('result is monotonic in k for fixed n', () => {
    const series = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => wilsonLowerBound(k, 10));
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it('result is always in [0, 1]', () => {
    for (let n = 1; n <= 50; n++) {
      for (let k = 0; k <= n; k++) {
        const v = wilsonLowerBound(k, n);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects non-finite inputs', () => {
    expect(() => wilsonLowerBound(Number.NaN, 10)).toThrow();
    expect(() => wilsonLowerBound(2, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('exposes WILSON_Z_95 = 1.96 (matches spec text)', () => {
    expect(WILSON_Z_95).toBe(1.96);
  });
});

describe('coverageWilsonLower', () => {
  it('is a thin wrapper around wilsonLowerBound', () => {
    expect(coverageWilsonLower(3, 10)).toBe(wilsonLowerBound(3, 10));
  });
});
