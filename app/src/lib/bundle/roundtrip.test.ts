// AC #8 — cross-session re-import round-trip.
//
// Spec invariant: a SkillBundle that has been serialized to JSON (export),
// re-parsed (import), and re-verified must reproduce the same content_hash
// and the same overall_verdict. The proof system is a function of the
// bundle's bytes; serialization must not perturb either.
//
// This is the unit-level guarantee behind the export/import flow in the
// /skills/[id] export button and /import textarea.

import { describe, it, expect } from 'vitest';
import { buildBundle } from './builder';
import { verifyBundle } from './verify';
import { bundleContentHash } from '../hash';
import type { SkillBundle, SkillManifest, ProofResult } from '../types';
import type { InteractionTrace } from '../trace';
import { canonicalize, sha256Hex } from '../hash';

async function edge(index: number, kind: string, observation: unknown) {
  return {
    index,
    ts: '2026-05-25T00:00:0' + index + 'Z',
    kind,
    state_hash: 'sha256:' + (await sha256Hex(canonicalize(observation))),
    observation
  };
}

async function makeBundle(): Promise<SkillBundle> {
  const trace: InteractionTrace = {
    trace_id: 'trace-rt-1',
    started_at: '2026-05-25T00:00:00Z',
    edges: [
      await edge(0, 'user_message', { content: 'hello' }),
      await edge(1, 'assistant_message', { content: 'hi', model: 'test/m' })
    ]
  };
  const manifest: SkillManifest = {
    schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
    skill_id: 'skill-rt',
    name: 'roundtrip', slug: 'roundtrip', description: 'rt', version: 1,
    derived_from_trace_id: 'trace-rt-1',
    body_choice: 'simulator',
    inputs: [{ name: 'goal', type: 'string', required: true }],
    outputs: [{ name: 'final_message', type: 'string' }],
    preconditions: [], binding: 'portable',
    capabilities_required: ['ambient'],
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z'
  };
  const proof: ProofResult = {
    schema: 'https://opensentience.org/spec/proof-result/v0.1',
    verifier_version: '0.1.0-alpha.0',
    computed_at: '2026-05-25T00:00:00Z',
    overall_verdict: 'inconclusive',
    proof_gates: [], invariant_results: [],
    authority_result: { decision: 'allow' },
    redaction_result: { profile: 'none' },
    replay_result: { status: 'not_run', fidelity_level: 'inconclusive' },
    conformance_check: { spec_version: '0.1' }
  };
  return buildBundle({ manifest, trace, proof });
}

describe('SkillBundle JSON round-trip (AC #8)', () => {
  it('preserves content_hash byte-for-byte across JSON serialize/parse', async () => {
    const original = await makeBundle();
    const wire = JSON.stringify(original);
    const reparsed = JSON.parse(wire) as SkillBundle;

    expect(reparsed.content_hash).toBe(original.content_hash);

    // Recomputing the canonical hash on the reparsed bundle must yield the same value.
    const recomputed = await bundleContentHash(reparsed as unknown as Record<string, unknown>);
    expect(recomputed).toBe(original.content_hash);
  });

  it('produces the same verdict and gate set after JSON round-trip', async () => {
    const original = await makeBundle();
    const wire = JSON.stringify(original);
    const reparsed = JSON.parse(wire) as SkillBundle;

    const beforeReport = await verifyBundle(original);
    const afterReport = await verifyBundle(reparsed);

    expect(afterReport.overall_verdict).toBe(beforeReport.overall_verdict);
    expect(afterReport.overall_verdict).toBe('pass');
    expect(afterReport.gates.map((g) => `${g.id}=${g.verdict}`).sort())
      .toEqual(beforeReport.gates.map((g) => `${g.id}=${g.verdict}`).sort());
  });

  it('rejects a bundle whose content_hash drifts from the wire payload', async () => {
    const original = await makeBundle();
    // Tamper with an observation after the hash was stamped — this is the
    // scenario the gate is designed to catch.
    const tampered = JSON.parse(JSON.stringify(original)) as SkillBundle;
    (tampered.interaction_trace.edges[0].observation as { content: string }).content = 'tampered';

    const report = await verifyBundle(tampered);
    expect(report.overall_verdict).toBe('fail');
    expect(report.gates.find((g) => g.id === 'gate.content_hash')?.verdict).toBe('fail');
  });
});

describe('storage stripStorageKey behavior (AC #8 storage path)', () => {
  // Storage uses `{ id: <natural-key>, ...row }` as the IndexedDB record so the
  // keypath has a stable name across all stores. The strip-on-read helper is
  // what keeps `id` from polluting the in-memory bundle. We verify the *shape*
  // contract here without instantiating IndexedDB (which would require a fake).
  it('canonical hash is invariant under added/removed top-level id field', async () => {
    const original = await makeBundle();
    const polluted = { id: original.bundle_id, ...original };
    delete (polluted as { id?: unknown }).id;
    const cleaned = polluted as SkillBundle;

    const hOriginal = await bundleContentHash(original as unknown as Record<string, unknown>);
    const hCleaned = await bundleContentHash(cleaned as unknown as Record<string, unknown>);
    expect(hCleaned).toBe(hOriginal);
  });
});
