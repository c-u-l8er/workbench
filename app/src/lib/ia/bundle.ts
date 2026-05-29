// Bundle → Invariant Arithmetic Value adapters.
//
// The six SkillBundle proof gates each project the bundle onto a single
// IA family, then call `consume` with the family-appropriate requirement.
// This file is the projection table. See `bundle/verify.ts` for the
// consume invocations.
//
//   gate                    family       requirement        law(s)
//   ------------------------ ------------ ------------------ --------
//   gate.content_hash        topological  beta_min: 1.0      L14
//   gate.trace_completeness  spatial      sigma_empty: true  L11/L14
//   gate.no_hidden_capability spatial     sigma_empty: true  L11/L14
//   gate.authority           governance   sigma_empty: true  L14
//   gate.redaction_verify    topological  forward_only: true L12/L14
//   gate.replay_fidelity     topological  forward_only: true L12/L14
//
// κ=true models a feedback loop / non-idempotent reuse. A redaction profile
// that is NOT idempotent is the operational equivalent of "output reused as
// input" — it carries the redacted bundle into a different state on second
// application. Same for a replay that drifts: the recorded observation no
// longer round-trips through canonicalize+sha256, which is exactly the κ
// shape from STACK_PROOF §V.

import { newValue, type Value } from './value';

export interface HashCheckInput {
  /** Whether the recomputed bundle hash matches the recorded one. */
  matches: boolean;
}

/** L14: β = 1.0 iff hash matches; otherwise β = 0.0. */
export function hashCheckValue(input: HashCheckInput): Value {
  return newValue(0, { beta: input.matches ? 1.0 : 0.0 });
}

export interface BrokenEdgesInput {
  /** Indices (as strings) of edges that fail the structural check. */
  broken: readonly string[];
}

/** L11/L14: σ = set of broken-edge indices; sigma_empty refuses any. */
export function traceCompletenessValue(input: BrokenEdgesInput): Value {
  return newValue(0, { sigma: input.broken });
}

export interface CapabilitySetInput {
  /** Capabilities used in the trace but not declared in the manifest. */
  undeclared: readonly string[];
}

/** L11/L14: σ = undeclared capabilities; sigma_empty refuses any. */
export function noHiddenCapabilityValue(input: CapabilitySetInput): Value {
  return newValue(0, { sigma: input.undeclared });
}

export interface AuthorityInput {
  /**
   * Authority violations as σ tags. Locally derived violations
   * (`cap:undeclared`) and Delegatic refusals (`block:<capability>`) both
   * land here so a single consume call adjudicates the gate.
   */
  violations: readonly string[];
  /** Reverse path of authorities consulted, for audit reconstruction. */
  authority_path?: readonly string[];
  /** Delegatic infra-level failure flips deny_default false → governance refuses. */
  delegatic_unreachable?: boolean;
}

/** L14 over the governance family. */
export function authorityValue(input: AuthorityInput): Value {
  return newValue(0, {
    sigma: input.violations,
    authority_path: input.authority_path ?? [],
    deny_default: !input.delegatic_unreachable
  });
}

export interface IdempotenceInput {
  /** True if applying the operation twice differs from applying once. */
  drifted: boolean;
}

/**
 * L12/L14: κ = drifted. forward_only refuses κ=true.
 * Used by both redaction_verify and replay_fidelity — they share the
 * "is this operation idempotent?" question, and κ is exactly the substrate's
 * record of that breaking down.
 */
export function idempotenceValue(input: IdempotenceInput): Value {
  return newValue(0, { kappa: input.drifted });
}
