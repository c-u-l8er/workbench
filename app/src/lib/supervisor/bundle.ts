// CurriculumBundle assembly + content_hash (Supervisor spec §3).
//
// Mirrors workbench/docs/spec/CURRICULUM_BUNDLE.v0.schema.json. Hash is
// computed identically to SkillBundle (canonicalize, exclude content_hash
// and signature, sha256). The same `bundleContentHash` helper applies.

import { bundleContentHash } from '../hash';
import { charterContentHash, type TeacherCharter } from './charter';
import { coverageWilsonLower } from './coverage';
import { computeFrontier, type ManifestationCell } from './manifestation';
import { WORKBENCH_VERSION } from '../version';

export const CURRICULUM_BUNDLE_SPEC_VERSION = '0.1' as const;
export const SUPERVISOR_VERSION = '0.1.0' as const;

export type CurriculumVerdict = 'pass' | 'partial' | 'fail' | 'inconclusive';

export type HaltReason =
  | 'max_skills_reached'
  | 'max_dollars_reached'
  | 'max_seconds_reached'
  | 'coverage_target_reached'
  | 'frontier_empty'
  | 'consecutive_failures'
  | 'user_aborted';

export interface SkillBundleRef {
  content_hash: string;
  manifestation: ManifestationCell;
  skill_slug?: string;
  verdict?: CurriculumVerdict;
}

export interface InvariantClaim {
  skill_content_hash: string;
  invariant_id: string;
  gate: string;
  passed: boolean;
  evidence_ref: string;
  critic_dissent?: boolean;
}

export interface CoverageReport {
  cells_total: number;
  cells_visited: number;
  cells_covered: number;
  wilson_lower_bound: number;
  frontier_remaining: ManifestationCell[];
}

export interface BudgetConsumed {
  skills_produced: number;
  wallclock_seconds: number;
  dollars_spent?: number;
  tokens_consumed?: number;
  halt_reason?: HaltReason;
}

export interface CurriculumBundle {
  curriculum_id: string;
  spec_version: '0.1';
  charter_ref: string;
  charter: TeacherCharter;
  skill_bundles: SkillBundleRef[];
  invariant_claims: InvariantClaim[];
  coverage: CoverageReport;
  budget_consumed: BudgetConsumed;
  prism_scores?: Record<string, number>;
  sealed_at: string;
  supervisor_version?: string;
  workbench_version?: string;
  content_hash: string;
  signature?: string | null;
}

export interface AssembleArgs {
  curriculum_id: string;
  charter: TeacherCharter;
  skill_bundles: SkillBundleRef[];
  invariant_claims: InvariantClaim[];
  budget_consumed: BudgetConsumed;
  prism_scores?: Record<string, number>;
  sealed_at?: string;
}

/**
 * Build a CurriculumBundle from a sealed supervisor run. Computes:
 *   - charter_ref = sha256(canonical charter)
 *   - coverage = frontier snapshot over the charter's manifestation_space
 *     with each skill_bundle's manifestation cell as one attempt, where
 *     `passed` is the invariant_claim matching the skill (charter's
 *     invariant) — if no matching claim exists for a skill, the attempt
 *     contributes to `visited` but not `covered`.
 *   - content_hash = sha256(canonical bundle minus content_hash + signature)
 */
export async function assembleCurriculumBundle(args: AssembleArgs): Promise<CurriculumBundle> {
  const charter_ref = await charterContentHash(args.charter);

  // Build attempts = one per skill_bundle, tagged with whether THIS charter's
  // invariant claim passed.
  const invariantId = args.charter.invariant_ref.invariant_id;
  const claimsByHash = new Map<string, InvariantClaim>();
  for (const c of args.invariant_claims) {
    if (c.invariant_id === invariantId) {
      claimsByHash.set(c.skill_content_hash, c);
    }
  }
  const attempts = args.skill_bundles.map((sb) => ({
    cell: sb.manifestation,
    passed: claimsByHash.get(sb.content_hash)?.passed === true
  }));

  const frontier = computeFrontier(args.charter.manifestation_space, attempts);

  const coverage: CoverageReport = {
    cells_total: frontier.cells_total,
    cells_visited: frontier.cells_visited,
    cells_covered: frontier.cells_covered,
    wilson_lower_bound: coverageWilsonLower(frontier.cells_covered, frontier.cells_total),
    frontier_remaining: frontier.frontier_remaining
  };

  const draft: Omit<CurriculumBundle, 'content_hash'> & { content_hash: string } = {
    curriculum_id: args.curriculum_id,
    spec_version: CURRICULUM_BUNDLE_SPEC_VERSION,
    charter_ref,
    charter: args.charter,
    skill_bundles: args.skill_bundles,
    invariant_claims: args.invariant_claims,
    coverage,
    budget_consumed: args.budget_consumed,
    sealed_at: args.sealed_at ?? new Date().toISOString(),
    supervisor_version: SUPERVISOR_VERSION,
    workbench_version: WORKBENCH_VERSION,
    content_hash: '',
    signature: null
  };

  if (args.prism_scores !== undefined) {
    draft.prism_scores = args.prism_scores;
  }

  const content_hash = await bundleContentHash(draft as unknown as Record<string, unknown>);
  return { ...draft, content_hash };
}

/**
 * Re-verify a CurriculumBundle's content_hash from its JSON form. Returns
 * `{ ok: true }` iff the recomputed hash matches the stored hash.
 */
export async function verifyCurriculumContentHash(
  bundle: CurriculumBundle
): Promise<{ ok: boolean; recomputed: string; stored: string }> {
  const recomputed = await bundleContentHash(bundle as unknown as Record<string, unknown>);
  return { ok: recomputed === bundle.content_hash, recomputed, stored: bundle.content_hash };
}
