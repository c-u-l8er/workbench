// Manifestation-space enumeration + visited/covered/frontier helpers
// (Supervisor spec §6.1, §6.2, §6.4).
//
// A ManifestationCell is an object whose keys are the charter's dimension
// names and whose values are one of that dimension's declared values. The
// cell-key is its canonical-JSON form, used for set membership and ordering.

import { canonicalize } from '../hash';
import type { ManifestationDimension } from './charter';

export type ManifestationCell = Record<string, string>;

/**
 * Enumerate the cartesian product of all dimensions, in lexicographic order
 * over dimension name (canonicalize() sorts keys anyway, so iteration order
 * within a cell is irrelevant; iteration order ACROSS cells is determined
 * by the order in `dimensions` for deterministic test fixtures).
 */
export function enumerateCells(dimensions: ManifestationDimension[]): ManifestationCell[] {
  if (dimensions.length === 0) return [];
  let acc: ManifestationCell[] = [{}];
  for (const dim of dimensions) {
    const next: ManifestationCell[] = [];
    for (const partial of acc) {
      for (const value of dim.values) {
        next.push({ ...partial, [dim.dimension]: value });
      }
    }
    acc = next;
  }
  return acc;
}

/**
 * Canonical key for a cell. Two cells with the same dimension→value mapping
 * always produce the same key regardless of property-insertion order.
 */
export function cellKey(cell: ManifestationCell): string {
  return canonicalize(cell);
}

/**
 * Total number of cells in the manifestation space. Equivalent to
 * enumerateCells(...).length but cheap (product of |values|).
 */
export function cellsTotal(dimensions: ManifestationDimension[]): number {
  return dimensions.reduce((acc, d) => acc * d.values.length, 1);
}

export interface FrontierSnapshot {
  cells_total: number;
  cells_visited: number;
  cells_covered: number;
  visited: ManifestationCell[];
  covered: ManifestationCell[];
  frontier_remaining: ManifestationCell[];
}

/**
 * Compute visited/covered/frontier from a charter's manifestation_space and
 * the visit records produced during the supervisor run.
 *
 * Visited = cells with ≥1 attempted skill.
 * Covered = visited cells with ≥1 attempt whose `passed === true`.
 * Frontier = unvisited ∪ visited-but-not-covered.
 *
 * Invalid attempt cells (cells not in the declared space) are ignored — the
 * supervisor's router never produces them, but if a test feeds one in, we
 * silently drop it rather than poisoning coverage. (The caller can sanity-
 * check via `validateCellAgainstSpace` below.)
 */
export function computeFrontier(
  dimensions: ManifestationDimension[],
  attempts: Array<{ cell: ManifestationCell; passed: boolean }>
): FrontierSnapshot {
  const all = enumerateCells(dimensions);
  const validKeys = new Set(all.map(cellKey));

  const visitedKeys = new Set<string>();
  const coveredKeys = new Set<string>();

  for (const a of attempts) {
    const k = cellKey(a.cell);
    if (!validKeys.has(k)) continue;
    visitedKeys.add(k);
    if (a.passed) coveredKeys.add(k);
  }

  const visited = all.filter((c) => visitedKeys.has(cellKey(c)));
  const covered = all.filter((c) => coveredKeys.has(cellKey(c)));
  const frontier_remaining = all.filter((c) => !coveredKeys.has(cellKey(c)));

  return {
    cells_total: all.length,
    cells_visited: visited.length,
    cells_covered: covered.length,
    visited,
    covered,
    frontier_remaining
  };
}

/**
 * True iff every dimension key in `cell` exists in the declared space AND the
 * cell's value for each dimension is one of that dimension's declared values
 * AND the cell carries no extra keys beyond declared dimensions.
 */
export function validateCellAgainstSpace(
  cell: ManifestationCell,
  dimensions: ManifestationDimension[]
): boolean {
  const expectedKeys = new Set(dimensions.map((d) => d.dimension));
  for (const k of Object.keys(cell)) {
    if (!expectedKeys.has(k)) return false;
  }
  for (const d of dimensions) {
    const v = cell[d.dimension];
    if (v === undefined) return false;
    if (!d.values.includes(v)) return false;
  }
  return true;
}

/**
 * Pick the next unvisited cell to attack. v0.1 — uniform-random pick from
 * the frontier. v0.2 will swap this for Wilson-frontier ordering (Supervisor
 * spec §6.5).
 *
 * `rng` defaults to Math.random; tests pass a seeded RNG for determinism.
 */
export function pickNextCell(
  frontier: ManifestationCell[],
  rng: () => number = Math.random
): ManifestationCell | null {
  if (frontier.length === 0) return null;
  const idx = Math.min(frontier.length - 1, Math.floor(rng() * frontier.length));
  return frontier[idx];
}
