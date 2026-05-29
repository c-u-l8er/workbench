// Assembles a SkillBundle from a SkillManifest + InteractionTrace + ProofResult.
// Computes content_hash last (spec §5.1) over canonical JSON with
// content_hash and signature stripped.

import { v4 as uuid } from 'uuid';
import { bundleContentHash } from '../hash';
import { WORKBENCH_VERSION } from '../version';
import type { SkillBundle, SkillManifest, ProofResult } from '../types';
import type { InteractionTrace } from '../trace';

export interface BuildArgs {
  manifest: SkillManifest;
  trace: InteractionTrace;
  proof: ProofResult;
  evidence?: unknown;
}

export async function buildBundle(args: BuildArgs): Promise<SkillBundle> {
  const evidence = args.evidence ?? deriveEvidence(args.manifest, args.trace, args.proof);
  const draft = {
    bundle_version: '0.1.0' as const,
    bundle_id: uuid(),
    skill_id: args.manifest.skill_id,
    skill_version: args.manifest.version,
    created_at: new Date().toISOString(),
    workbench_version: WORKBENCH_VERSION,
    manifest: args.manifest,
    interaction_trace: { trace_id: args.trace.trace_id, edges: args.trace.edges },
    proof: args.proof,
    evidence,
    content_hash: '',
    signature: null as string | null
  } satisfies SkillBundle;

  const content_hash = await bundleContentHash(draft as unknown as Record<string, unknown>);
  return { ...draft, content_hash };
}

// EvidenceBundle is the PRISM-facing view of the same data. v0.1 re-projects
// rather than duplicating storage: a verifier can derive it on demand.
function deriveEvidence(manifest: SkillManifest, trace: InteractionTrace, proof: ProofResult) {
  return {
    schema: 'https://opensentience.org/spec/evidence-bundle/v0.1',
    scenario_ref: manifest.skill_id,
    system: { name: 'workbench', version: WORKBENCH_VERSION },
    trace,
    proof,
    capability_snapshot: manifest.capabilities_required
  };
}
