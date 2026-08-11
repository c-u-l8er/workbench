// Seal an ingested segment into a verified SkillBundle.
//
// This is the same sequence `crystallize()` runs in routes/teach/+page.svelte:
//   buildBundle → verifyBundle → stamp the verdict back onto proof → re-seal
//   content_hash so the persisted bundle still verifies on import.
//
// It lives here rather than being copied because the teach flow and the
// ingester must produce byte-identical bundle structure — otherwise a bundle's
// provenance would change what "verified" means, which is the one thing a
// proof harness cannot afford.
//
// Pure: no fs, no network. verifyBundle is offline unless `useDelegatic` is
// set, and this never sets it.

import { buildBundle } from '../bundle/builder';
import { verifyBundle } from '../bundle/verify';
import { bundleContentHash } from '../hash';
import { WORKBENCH_VERSION, SPEC_VERSION } from '../version';
import type { InteractionTrace } from '../trace';
import type { ProofGate, ProofResult, SkillBundle, SkillManifest, Verdict } from '../types';
import type { RedactionProfile } from '../redact';

export interface SealedBundle {
  bundle: SkillBundle;
  overall_verdict: Verdict;
  gates: ProofGate[];
}

export async function sealBundle(
  manifest: SkillManifest,
  trace: InteractionTrace,
  redactionProfile: RedactionProfile = 'none'
): Promise<SealedBundle> {
  const now = new Date().toISOString();

  const proof: ProofResult = {
    schema: 'https://opensentience.org/spec/proof-result/v0.1',
    verifier_version: WORKBENCH_VERSION,
    computed_at: now,
    overall_verdict: 'inconclusive',
    proof_gates: [],
    invariant_results: [],
    authority_result: { decision: 'allow' },
    redaction_result: { profile: redactionProfile },
    replay_result: { status: 'not_run', fidelity_level: 'inconclusive' },
    conformance_check: { spec_version: SPEC_VERSION }
  };

  const bundle = await buildBundle({ manifest, trace, proof });
  const report = await verifyBundle(bundle);

  const replayGate = report.gates.find((g) => g.id === 'gate.replay_fidelity');
  bundle.proof = {
    ...proof,
    overall_verdict: report.overall_verdict,
    proof_gates: report.gates,
    ia_substrate: report.ia_substrate,
    replay_result: {
      ...proof.replay_result,
      status: replayGate?.verdict === 'pass' ? 'success' : 'not_run',
      fidelity_level: replayGate?.level ?? 'inconclusive'
    }
  };
  bundle.content_hash = await bundleContentHash(bundle as unknown as Record<string, unknown>);

  return { bundle, overall_verdict: report.overall_verdict, gates: report.gates };
}
