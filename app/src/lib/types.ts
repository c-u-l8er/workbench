// Workbench v0.1 core types. Mirror docs/spec/*.schema.json.
// Source of truth is the JSON schemas under workbench/docs/spec/.

export type BodyChoice = 'browser' | 'host' | 'simulator';

export type Capability =
  | `&${string}.${string}`
  | 'ambient';

export type FidelityLevel = 'exact' | 'structural' | 'semantic' | 'failed' | 'inconclusive';

export type Verdict = 'pass' | 'partial' | 'fail' | 'inconclusive';

export type ProofGateId =
  | 'gate.authority'
  | 'gate.trace_completeness'
  | 'gate.replay_fidelity'
  | 'gate.redaction_verify'
  | 'gate.content_hash'
  | 'gate.no_hidden_capability';

export interface SkillManifest {
  schema: 'https://opensentience.org/spec/skill-manifest/v0.1';
  skill_id: string;
  name: string;
  slug: string;
  description: string;
  version: number;
  derived_from_trace_id: string;
  body_choice: BodyChoice;
  inputs: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  outputs: Array<{ name: string; type: string }>;
  preconditions: string[];
  binding: 'model_version_bound' | 'model_family_bound' | 'portable' | 'substrate_only';
  validated_against?: Array<{
    model: string;
    fidelity: number;
    level?: FidelityLevel;
    ts: string;
  }>;
  regression_probes?: unknown[];
  fallback_behavior?: 'halt_on_state_hash_mismatch' | 'continue_on_minor' | 'ask_user';
  capabilities_required: Capability[];
  delegatic_policy_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * The IA family a proof gate exercises. Set when `verifyBundle` derives the
 * gate's verdict from an `InvariantArithmetic.consume` call. See
 * `src/lib/ia/bundle.ts` for the per-gate Value derivation.
 */
export type InvariantFamily = 'topological' | 'spatial' | 'temporal' | 'governance';

export interface ProofGate {
  id: ProofGateId;
  verdict: Verdict | 'n/a';
  evidence_ref?: string;
  level?: FidelityLevel;
  reason?: string;
  /** The Invariant Arithmetic law(s) this gate operationalizes (e.g. 'L14'). */
  law?: string;
  /** The IA family the gate's `consume` call examines. */
  invariant_family?: InvariantFamily;
}

export interface ProofResult {
  schema: 'https://opensentience.org/spec/proof-result/v0.1';
  verifier_version: string;
  computed_at: string;
  overall_verdict: Verdict;
  proof_gates: ProofGate[];
  invariant_results: Array<{
    id: string;
    held: boolean | 'n/a';
    checked_n?: number;
    detail?: string;
  }>;
  authority_result: {
    decision: 'allow' | 'deny' | 'partial';
    policy_id?: string;
    denials?: Array<{ capability: string; reason: string; edge_index?: number }>;
    // v0.2 — AuthorizationBlocks issued by delegatic-mcp during teach. Each
    // block is an HMAC-signed grant for one action_type and is verifiable
    // post-hoc by gate.authority through the same delegatic-mcp `verify` tool.
    // Bundles without authorization_blocks fall back to v0.1 local-kernel
    // semantics for the gate.
    authorization_blocks?: Array<{
      capability: string;
      action_type: string;
      policy_id: string;
      approved_by: string;
      approved_at: string;
      expires_at: string;
      authorization_token: string;
    }>;
  };
  redaction_result: {
    profile: 'none' | 'transcript_pii' | 'full';
    fields_stripped?: string[];
    post_redaction_hash_matches?: boolean;
  };
  replay_result: {
    status: 'success' | 'halted' | 'completed_with_surprises' | 'not_run';
    fidelity_level: FidelityLevel;
    edges_attempted?: number;
    edges_committed?: number;
    halted_at_edge?: number | null;
  };
  conformance_check: {
    spec_version: string;
    fixtures_passed?: string[];
    fixtures_failed?: string[];
  };
  /**
   * Optional declaration that this ProofResult's gates are computed by
   * Invariant Arithmetic. When present, every gate SHOULD carry `law` and
   * `invariant_family`. See `src/lib/ia/` for the reference implementation
   * and STACK_PROOF.html §I/§II for the substrate definition.
   */
  ia_substrate?: {
    version: string;
    laws_exercised?: string[];
    families_exercised?: InvariantFamily[];
  };
}

export interface SkillBundle {
  bundle_version: '0.1.0';
  bundle_id: string;
  skill_id: string;
  skill_version: number;
  created_at: string;
  workbench_version: string;
  manifest: SkillManifest;
  interaction_trace: { trace_id: string; edges: unknown[] };
  proof: ProofResult;
  evidence: unknown; // EvidenceBundle - typed in lib/bundle/evidence.ts
  content_hash: string;
  signature: string | null;
}

export interface ReplayReport {
  replay_id: string;
  skill_id: string;
  skill_version: number;
  input: Record<string, unknown>;
  started_at: string;
  ended_at: string;
  edges_attempted: number;
  edges_committed: number;
  status: 'success' | 'halted_at_edge_N' | 'completed_with_surprises';
  halted_at_edge?: number | null;
  surprise_signals: Array<{
    edge_index: number;
    kind: 'state_hash_mismatch' | 'affordance_drift' | 'policy_deny' | 'model_refusal' | 'other';
    detail?: string;
    /** Invariant Arithmetic law(s) the surprise violates (e.g. 'L12/L14'). */
    law?: string;
    /** IA family the surprise's `consume` refusal projects onto. */
    invariant_family?: InvariantFamily;
  }>;
  fidelity: number;
  fidelity_level: FidelityLevel;
  model_used: string;
  cost_usd?: number | null;
  evidence_bundle_id: string;
}

export interface FixtureScenario {
  schema: 'https://opensentience.org/spec/workbench-fixture-scenario/v0.1';
  id: string;
  purpose: string;
  body_choice: BodyChoice;
  task_prompt?: string;
  inputs: Array<{ name: string; type: string; example?: unknown }>;
  expected_outputs_shape: Array<{ name: string; type: string }>;
  invariants_exercised: string[];
  proof_gates_exercised: ProofGateId[];
  pass_criteria: {
    overall_verdict: Verdict;
    fidelity_level?: FidelityLevel;
    must_emit_signal?: string[];
    must_deny?: string[];
    must_redact?: string[];
    min_models?: number;
    notes?: string;
  };
  seeded_secrets?: string[];
  capabilities_declared?: Capability[];
  capabilities_attempted?: Capability[];
}
