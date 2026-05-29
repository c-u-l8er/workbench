// SkillBundle verifier. Re-runs the six proof gates against a bundle
// loaded from disk or IndexedDB (spec §15.1).
//
// As of the M2 IA integration (see `STACK_PROOF.html` v0.3 and
// `../ia/`), every gate's verdict is computed by an Invariant Arithmetic
// `consume(value, requirements)` call. The projection from a bundle onto
// a per-gate `Value` lives in `../ia/bundle.ts`. The gate's `law` and
// `invariant_family` fields name which law and family the gate exercises.
//
// Gates and the laws they operationalize:
//
//   gate.content_hash         L14 — β = 1.0 iff hash matches, beta_min: 1.0
//   gate.trace_completeness   L11/L14 — σ = broken edge indices, sigma_empty
//   gate.no_hidden_capability L11/L14 — σ = undeclared capabilities, sigma_empty
//   gate.authority            L14 — σ = unauthorized + delegatic refusals,
//                              authority_path captured, sigma_empty required
//   gate.redaction_verify     L12/L14 — κ = (profile not idempotent),
//                              forward_only refuses κ = true
//   gate.replay_fidelity      L12/L14 — κ = (replay drifted), forward_only
//
// Authority in v0.1 uses a local kernel: capabilities listed in the manifest
// are assumed allowed; capabilities in the trace that aren't declared fail
// `gate.no_hidden_capability` AND `gate.authority`. In v0.2, opting into
// `useDelegatic` adds HMAC/TTL verification of recorded authorization
// blocks; any non-verifying block becomes a σ violation in the same gate.

import { bundleContentHash } from '../hash';
import { applyProfile, isIdempotent, type RedactionProfile } from '../redact';
import { replayBundle } from './replay';
import * as delegatic from '../mcp/delegatic';
import type { SkillBundle, ProofGate, Verdict, Capability } from '../types';

import { consume, IA_SUBSTRATE_DECLARATION } from '../ia';
import {
  authorityValue,
  hashCheckValue,
  idempotenceValue,
  noHiddenCapabilityValue,
  traceCompletenessValue
} from '../ia/bundle';
import type { InvariantFamily, ProofResult } from '../types';

export interface VerifyReport {
  overall_verdict: Verdict;
  gates: ProofGate[];
  /**
   * Declares that every gate in `gates` was derived by an
   * `InvariantArithmetic.consume(value, requirements)` call. Callers should
   * propagate this onto the persisted `ProofResult.ia_substrate` so the
   * bundle is self-describing.
   */
  ia_substrate: NonNullable<ProofResult['ia_substrate']>;
}

export interface VerifyOptions {
  /**
   * v0.2 — when true and the bundle carries `authority_result.authorization_blocks`,
   * verify each block's HMAC signature + TTL against delegatic-mcp. Default false
   * keeps verifyBundle pure and offline (matches v0.1 semantics and lets the
   * vitest suite run without a network).
   */
  useDelegatic?: boolean;
}

export async function verifyBundle(bundle: SkillBundle, options: VerifyOptions = {}): Promise<VerifyReport> {
  const gates: ProofGate[] = [];

  // -- gate.content_hash  (L14 / topological β) -----------------------------
  const expected = await bundleContentHash(bundle as unknown as Record<string, unknown>);
  const hashOk = expected === bundle.content_hash;
  {
    const v = hashCheckValue({ matches: hashOk });
    const r = consume(v, { beta_min: 1.0 });
    gates.push({
      id: 'gate.content_hash',
      verdict: r.ok ? 'pass' : 'fail',
      reason: r.ok ? undefined : `expected ${expected}`,
      law: 'L14',
      invariant_family: 'topological'
    });
  }

  // -- gate.trace_completeness  (L11/L14 / spatial σ) -----------------------
  const edges = bundle.interaction_trace.edges as Array<Record<string, unknown>>;
  const broken: string[] = [];
  edges.forEach((e, i) => {
    if (e.index !== i || typeof e.ts !== 'string' || typeof e.kind !== 'string') {
      broken.push(`edge:${i}`);
    }
  });
  {
    const v = traceCompletenessValue({ broken });
    const r = consume(v, { sigma_empty: true });
    gates.push({
      id: 'gate.trace_completeness',
      verdict: r.ok ? 'pass' : 'fail',
      reason: r.ok ? undefined : 'trace edges missing fields or non-contiguous',
      law: 'L11/L14',
      invariant_family: 'spatial'
    });
  }

  // -- gate.no_hidden_capability  (L11/L14 / spatial σ) ---------------------
  const declared = new Set<Capability>(bundle.manifest.capabilities_required);
  const used = new Set<string>();
  for (const e of edges) {
    const cap = e['capability'] as string | undefined;
    if (cap) used.add(cap);
  }
  const undeclared = [...used].filter((c) => !declared.has(c as Capability));
  {
    const v = noHiddenCapabilityValue({ undeclared });
    const r = consume(v, { sigma_empty: true });
    gates.push({
      id: 'gate.no_hidden_capability',
      verdict: r.ok ? 'pass' : 'fail',
      reason: r.ok ? undefined : `undeclared: ${undeclared.join(', ')}`,
      law: 'L11/L14',
      invariant_family: 'spatial'
    });
  }

  // -- gate.authority  (L14 / governance) -----------------------------------
  // v0.1 baseline: every used capability must be declared (the "no hidden
  // authority" rule, spec §7.6). v0.2 enhancement: each recorded
  // AuthorizationBlock must independently verify against delegatic-mcp.
  // Both kinds of violation land in σ via authorityValue, so a single
  // consume call adjudicates the gate.
  const blocks = bundle.proof.authority_result.authorization_blocks ?? [];
  const localViolations = undeclared.map((c) => `cap:${c}`);
  const delegaticViolations: string[] = [];
  let delegaticUnreachable = false;
  let delegaticInfraNote: string | undefined;

  if (options.useDelegatic && blocks.length > 0) {
    try {
      const sess = await delegatic.connect();
      for (const b of blocks) {
        const { capability: _c, action_type: _a, ...wireBlock } = b;
        void _c; void _a;
        const r = await delegatic.verify(sess, wireBlock);
        if (!r.verified) {
          delegaticViolations.push(`block:${b.capability}:${b.action_type}:${r.reason ?? 'refused'}`);
        }
      }
    } catch (err) {
      delegaticUnreachable = true;
      delegaticInfraNote = `delegatic verify unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const authorityViolations = [...localViolations, ...delegaticViolations];
  const authorityV = authorityValue({
    violations: authorityViolations,
    authority_path: blocks.map((b) => b.capability),
    delegatic_unreachable: delegaticUnreachable
  });
  const authorityConsume = consume(authorityV, { sigma_empty: true });
  // Infra failures (delegatic unreachable) shouldn't downgrade a passing
  // gate — surface as the gate's reason while keeping the local verdict.
  let authorityReason: string | undefined;
  if (!authorityConsume.ok) {
    const detail: string[] = [];
    if (localViolations.length > 0) {
      detail.push(`undeclared capability invokes implicit grant: ${undeclared.join(', ')}`);
    }
    if (delegaticViolations.length > 0) {
      detail.push(`delegatic refused: ${delegaticViolations.join('; ')}`);
    }
    authorityReason = detail.join('; ') || undefined;
  } else if (delegaticInfraNote) {
    authorityReason = delegaticInfraNote;
  }
  gates.push({
    id: 'gate.authority',
    verdict: authorityConsume.ok ? 'pass' : 'fail',
    reason: authorityReason,
    law: 'L14',
    invariant_family: 'governance'
  });

  // -- gate.redaction_verify  (L12/L14 / topological κ) ---------------------
  const profile = (bundle.proof.redaction_result?.profile ?? 'none') as RedactionProfile;
  const idem = isIdempotent(bundle, profile);
  {
    const v = idempotenceValue({ drifted: !idem });
    const r = consume(v, { forward_only: true });
    gates.push({
      id: 'gate.redaction_verify',
      verdict: r.ok ? 'pass' : 'fail',
      reason: r.ok ? undefined : `redaction profile ${profile} is not idempotent on this trace`,
      law: 'L12/L14',
      invariant_family: 'topological'
    });
    // `applyProfile` is exported for runtime use elsewhere; reference here
    // so a future redaction-aware verifier can rebuild the canonicalized
    // profile without a separate import.
    void applyProfile;
  }

  // -- gate.replay_fidelity  (L12/L14 / topological κ) ----------------------
  // Walk the recorded trace against an executor that returns the recorded
  // observation. Any drift means the observation/state_hash pair on a
  // recorded edge does not round-trip through canonicalize + sha256 — the
  // operational definition of κ in this gate.
  try {
    const report = await replayBundle({
      bundle,
      mode: 'exact',
      executeStep: async (i) => ({ observation: (edges[i] as { observation?: unknown }).observation })
    });
    const drifted = report.status !== 'success';
    const v = idempotenceValue({ drifted });
    const r = consume(v, { forward_only: true });
    gates.push({
      id: 'gate.replay_fidelity',
      verdict: r.ok ? 'pass' : 'fail',
      level: report.fidelity_level,
      reason: r.ok ? undefined : `${report.status} @ edge ${report.halted_at_edge ?? '?'}`,
      law: 'L12/L14',
      invariant_family: 'topological'
    });
  } catch (err) {
    gates.push({
      id: 'gate.replay_fidelity',
      verdict: 'inconclusive',
      reason: err instanceof Error ? err.message : String(err),
      law: 'L12/L14',
      invariant_family: 'topological'
    });
  }

  const overall_verdict: Verdict = gates.some((g) => g.verdict === 'fail')
    ? 'fail'
    : gates.some((g) => g.verdict === 'partial' || g.verdict === 'inconclusive')
    ? 'partial'
    : 'pass';

  // Project the union of `invariant_family` values actually observed on the
  // gates back onto the substrate declaration. Keeps `families_exercised`
  // honest if a future gate stops touching one of the four families.
  const familiesSeen = new Set<InvariantFamily>();
  for (const g of gates) {
    if (g.invariant_family) familiesSeen.add(g.invariant_family);
  }
  const ia_substrate: NonNullable<ProofResult['ia_substrate']> = {
    version: IA_SUBSTRATE_DECLARATION.version,
    laws_exercised: [...IA_SUBSTRATE_DECLARATION.laws_exercised],
    families_exercised: [...familiesSeen]
  };

  return { overall_verdict, gates, ia_substrate };
}
