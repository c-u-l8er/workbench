// Invariant Arithmetic v0.3 — TypeScript port of the Elixir reference impl
// in AmpersandBoxDesign/reference/elixir/invariant_arithmetic.
//
// Substrate: a product of monoids over four families
//   - topological  (κ cyclicity, β confidence)
//   - spatial      (σ source/conflict tags)
//   - temporal     (π phase, ι instance, ψ cadence)
//   - governance   (authority_path, deny_default, audit)
//
// Six operations: combine, chain, promote, reconcile, deliberate, consume.
// Fifteen laws verified by property test in laws.test.ts (1000 trials each).
//
// All values are immutable plain objects — every operation returns a fresh
// Value. Browser-safe, framework-free, ~400 LOC including types.

export type { Phase } from './phase';
export { PHASES, phaseIndex, phaseLeq } from './phase';

export type { Value, ValueOpts, AuditEntry } from './value';
export {
  newValue,
  zero,
  ZERO,
  retrieval,
  decision,
  action,
  learning,
  consolidation
} from './value';

export { combine } from './combine';

export type { ChainResult, PhaseViolation } from './chain';
export { chain, chainOrThrow, PhaseViolationError } from './chain';

export type { PromoteOpts } from './ops';
export { promote, reconcile, deliberate, cycle } from './ops';

export type { Requirements, ConsumeResult } from './consume';
export { consume } from './consume';

export type { SurpriseKind, SurpriseProjection } from './surprise';
export { projectSurprise } from './surprise';

/**
 * The substrate version this port targets. Bumped in lockstep with the
 * Elixir reference impl in
 * `AmpersandBoxDesign/reference/elixir/invariant_arithmetic`.
 */
export const IA_VERSION = '0.3' as const;

/**
 * Canonical IA substrate declaration. Attach to a `ProofResult.ia_substrate`
 * (or an `EvidenceBundle.invariants`) when a verifier wants to claim that
 * its gates are IA-derived.
 */
export const IA_SUBSTRATE_DECLARATION = {
  version: IA_VERSION,
  laws_exercised: ['L11', 'L12', 'L14'],
  families_exercised: ['topological', 'spatial', 'governance'] as const
};

export {
  authorityValue,
  hashCheckValue,
  idempotenceValue,
  noHiddenCapabilityValue,
  traceCompletenessValue,
  type AuthorityInput,
  type BrokenEdgesInput,
  type CapabilitySetInput,
  type HashCheckInput,
  type IdempotenceInput
} from './bundle';

export type { Prism9Vector, ProjectArgs } from './prism9';
export { projectPrism9, PRISM9_DIMENSIONS } from './prism9';

export type { PhaseViolationReport, PhaseCheckResult } from './phase_check';
export { checkPhaseOrder, edgeToPhase } from './phase_check';
