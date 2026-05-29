// Manifestation-space tests.

import { describe, it, expect } from 'vitest';
import {
  enumerateCells,
  cellKey,
  cellsTotal,
  computeFrontier,
  validateCellAgainstSpace,
  pickNextCell
} from './manifestation';
import type { ManifestationDimension } from './charter';

const TWO_BY_TWO: ManifestationDimension[] = [
  { dimension: 'body', values: ['simulator', 'browser'] },
  { dimension: 'turn_count', values: ['short', 'long'] }
];

// Mirrors the spec §2.3 worked example: 2 × 3 × 3 × 2 = 36.
const WORKED_EXAMPLE: ManifestationDimension[] = [
  { dimension: 'body', values: ['simulator', 'browser'] },
  { dimension: 'turn_count', values: ['single', 'short', 'long'] },
  { dimension: 'redaction_profile', values: ['none', 'transcript_pii', 'full'] },
  { dimension: 'state_mutation', values: ['pure', 'side_effecting'] }
];

describe('enumerateCells', () => {
  it('produces the cartesian product', () => {
    const cells = enumerateCells(TWO_BY_TWO);
    expect(cells).toHaveLength(4);
    const keys = cells.map(cellKey).sort();
    expect(keys).toEqual([
      cellKey({ body: 'browser', turn_count: 'long' }),
      cellKey({ body: 'browser', turn_count: 'short' }),
      cellKey({ body: 'simulator', turn_count: 'long' }),
      cellKey({ body: 'simulator', turn_count: 'short' })
    ].sort());
  });

  it('matches the worked-example size of 36', () => {
    expect(enumerateCells(WORKED_EXAMPLE)).toHaveLength(36);
    expect(cellsTotal(WORKED_EXAMPLE)).toBe(36);
  });

  it('returns [] for empty dimensions', () => {
    expect(enumerateCells([])).toEqual([]);
  });
});

describe('cellKey', () => {
  it('is order-independent in property insertion', () => {
    expect(cellKey({ a: '1', b: '2' })).toBe(cellKey({ b: '2', a: '1' }));
  });
});

describe('computeFrontier', () => {
  it('marks visited but not covered when no attempt passes', () => {
    const attempts = [
      { cell: { body: 'simulator', turn_count: 'short' }, passed: false }
    ];
    const f = computeFrontier(TWO_BY_TWO, attempts);
    expect(f.cells_total).toBe(4);
    expect(f.cells_visited).toBe(1);
    expect(f.cells_covered).toBe(0);
    expect(f.frontier_remaining).toHaveLength(4); // visited-but-not-covered stays in frontier
  });

  it('marks covered when at least one attempt passes', () => {
    const attempts = [
      { cell: { body: 'simulator', turn_count: 'short' }, passed: false },
      { cell: { body: 'simulator', turn_count: 'short' }, passed: true }
    ];
    const f = computeFrontier(TWO_BY_TWO, attempts);
    expect(f.cells_visited).toBe(1);
    expect(f.cells_covered).toBe(1);
    expect(f.frontier_remaining).toHaveLength(3);
  });

  it('ignores attempts whose cell is not in the declared space', () => {
    const attempts = [
      { cell: { body: 'mainframe', turn_count: 'short' }, passed: true },
      { cell: { body: 'simulator', turn_count: 'short' }, passed: true }
    ];
    const f = computeFrontier(TWO_BY_TWO, attempts);
    expect(f.cells_covered).toBe(1);
  });

  it('full coverage empties the frontier', () => {
    const attempts = enumerateCells(TWO_BY_TWO).map((cell) => ({ cell, passed: true }));
    const f = computeFrontier(TWO_BY_TWO, attempts);
    expect(f.cells_covered).toBe(4);
    expect(f.frontier_remaining).toEqual([]);
  });
});

describe('validateCellAgainstSpace', () => {
  it('passes valid cells', () => {
    expect(
      validateCellAgainstSpace({ body: 'simulator', turn_count: 'short' }, TWO_BY_TWO)
    ).toBe(true);
  });

  it('rejects cells with unknown dimension', () => {
    expect(
      validateCellAgainstSpace({ body: 'simulator', extra: 'x' } as never, TWO_BY_TWO)
    ).toBe(false);
  });

  it('rejects cells with unknown value', () => {
    expect(
      validateCellAgainstSpace({ body: 'mainframe', turn_count: 'short' }, TWO_BY_TWO)
    ).toBe(false);
  });

  it('rejects cells missing a declared dimension', () => {
    expect(
      validateCellAgainstSpace({ body: 'simulator' } as never, TWO_BY_TWO)
    ).toBe(false);
  });
});

describe('pickNextCell', () => {
  it('returns null for empty frontier', () => {
    expect(pickNextCell([])).toBeNull();
  });

  it('picks deterministically with a seeded rng', () => {
    const cells = enumerateCells(TWO_BY_TWO);
    const r1 = pickNextCell(cells, () => 0);
    const r2 = pickNextCell(cells, () => 0);
    expect(cellKey(r1!)).toBe(cellKey(r2!));
  });

  it('clamps to last element when rng returns ~1.0', () => {
    const cells = enumerateCells(TWO_BY_TWO);
    const r = pickNextCell(cells, () => 0.9999999);
    expect(cellKey(r!)).toBe(cellKey(cells[cells.length - 1]));
  });
});
