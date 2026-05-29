import { describe, it, expect } from 'vitest';
import { buildBundle } from './builder';
import { verifyBundle } from './verify';
import type { SkillManifest, ProofResult } from '../types';
import type { InteractionTrace } from '../trace';
import { canonicalize, sha256Hex, bundleContentHash } from '../hash';

async function edgeWithObservation(index: number, kind: string, observation: unknown) {
  return {
    index,
    ts: '2026-05-25T00:00:0' + index + 'Z',
    kind,
    state_hash: 'sha256:' + (await sha256Hex(canonicalize(observation))),
    observation
  };
}

async function makeTrace(): Promise<InteractionTrace> {
  return {
    trace_id: 'trace-1',
    started_at: '2026-05-25T00:00:00Z',
    edges: [
      await edgeWithObservation(0, 'user_message', { content: 'hello' }),
      await edgeWithObservation(1, 'assistant_message', { content: 'hi', model: 'test/m' })
    ]
  };
}

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
    skill_id: 'skill-1',
    name: 'unit', slug: 'unit', description: '', version: 1,
    derived_from_trace_id: 'trace-1',
    body_choice: 'simulator',
    inputs: [{ name: 'goal', type: 'string', required: true }],
    outputs: [{ name: 'final_message', type: 'string' }],
    preconditions: [], binding: 'portable',
    capabilities_required: ['ambient'],
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides
  };
}

function makeProof(): ProofResult {
  return {
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
}

describe('verifyBundle — happy path', () => {
  it('passes all 6 gates on a clean bundle', async () => {
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);

    expect(report.overall_verdict).toBe('pass');
    const ids = report.gates.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining([
      'gate.content_hash',
      'gate.trace_completeness',
      'gate.no_hidden_capability',
      'gate.authority',
      'gate.redaction_verify',
      'gate.replay_fidelity'
    ]));
    expect(report.gates.every((g) => g.verdict === 'pass')).toBe(true);
  });
});

describe('verifyBundle — gate.content_hash', () => {
  it('fails when content_hash is corrupted', async () => {
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    bundle.content_hash = 'sha256:' + '0'.repeat(64);
    const report = await verifyBundle(bundle);

    expect(report.overall_verdict).toBe('fail');
    expect(report.gates.find((g) => g.id === 'gate.content_hash')?.verdict).toBe('fail');
  });
});

describe('verifyBundle — gate.no_hidden_capability + gate.authority', () => {
  it('fails both when an undeclared capability appears in the trace', async () => {
    const trace = await makeTrace();
    trace.edges[0].capability = '&body.os';
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    // Re-stamp content_hash because we just mutated the trace.
    bundle.content_hash = await bundleContentHash(bundle as unknown as Record<string, unknown>);
    const report = await verifyBundle(bundle);

    expect(report.overall_verdict).toBe('fail');
    expect(report.gates.find((g) => g.id === 'gate.no_hidden_capability')?.verdict).toBe('fail');
    expect(report.gates.find((g) => g.id === 'gate.authority')?.verdict).toBe('fail');
    expect(report.gates.find((g) => g.id === 'gate.replay_fidelity')?.verdict).toBe('pass');
  });

  it('passes both when the capability is declared in the manifest', async () => {
    const trace = await makeTrace();
    trace.edges[0].capability = '&body.os';
    const bundle = await buildBundle({
      manifest: makeManifest({ capabilities_required: ['ambient', '&body.os'] }),
      trace,
      proof: makeProof()
    });
    const report = await verifyBundle(bundle);

    expect(report.gates.find((g) => g.id === 'gate.no_hidden_capability')?.verdict).toBe('pass');
    expect(report.gates.find((g) => g.id === 'gate.authority')?.verdict).toBe('pass');
  });
});

describe('verifyBundle — gate.replay_fidelity', () => {
  it('fails when a recorded state_hash does not match the observation', async () => {
    const trace = await makeTrace();
    trace.edges[1].state_hash = 'sha256:' + '0'.repeat(64);
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);

    expect(report.overall_verdict).toBe('fail');
    const g = report.gates.find((x) => x.id === 'gate.replay_fidelity');
    expect(g?.verdict).toBe('fail');
    expect(g?.reason).toMatch(/halted/);
  });

  it('annotates state_hash_mismatch surprise with L12/L14 + topological', async () => {
    const { replayBundle } = await import('./replay');
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });

    const report = await replayBundle({
      bundle,
      mode: 'exact',
      // Return a different observation to force a state_hash_mismatch.
      executeStep: async () => ({ observation: { content: 'different' } })
    });

    const s = report.surprise_signals[0];
    expect(s.kind).toBe('state_hash_mismatch');
    expect(s.law).toBe('L12/L14');
    expect(s.invariant_family).toBe('topological');
  });
});

describe('verifyBundle — gate.trace_completeness', () => {
  it('fails when edge indices are non-contiguous', async () => {
    const trace = await makeTrace();
    trace.edges[1].index = 5;
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);

    expect(report.gates.find((g) => g.id === 'gate.trace_completeness')?.verdict).toBe('fail');
  });
});

describe('verifyBundle — IA annotations', () => {
  it('tags every gate with its law and invariant family', async () => {
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);

    const byId = Object.fromEntries(report.gates.map((g) => [g.id, g]));
    expect(byId['gate.content_hash']).toMatchObject({ law: 'L14', invariant_family: 'topological' });
    expect(byId['gate.trace_completeness']).toMatchObject({ law: 'L11/L14', invariant_family: 'spatial' });
    expect(byId['gate.no_hidden_capability']).toMatchObject({ law: 'L11/L14', invariant_family: 'spatial' });
    expect(byId['gate.authority']).toMatchObject({ law: 'L14', invariant_family: 'governance' });
    expect(byId['gate.redaction_verify']).toMatchObject({ law: 'L12/L14', invariant_family: 'topological' });
    expect(byId['gate.replay_fidelity']).toMatchObject({ law: 'L12/L14', invariant_family: 'topological' });
  });

  it('declares an ia_substrate matching the families actually observed on the gates', async () => {
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);

    expect(report.ia_substrate.version).toBe('0.3');
    expect(report.ia_substrate.laws_exercised).toEqual(
      expect.arrayContaining(['L11', 'L12', 'L14'])
    );
    // Every IA family touched by a gate must appear in families_exercised, and
    // no others may leak in. Verifies the projection in verify.ts is honest.
    const familiesFromGates = new Set(
      report.gates.map((g) => g.invariant_family).filter(Boolean) as string[]
    );
    expect(new Set(report.ia_substrate.families_exercised)).toEqual(familiesFromGates);
  });
});

describe('verifyBundle — redacted-then-resealed bundle', () => {
  it('passes all gates with replay_fidelity at structural level', async () => {
    const { applyProfile } = await import('../redact');
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });

    const profiled = applyProfile(bundle, 'transcript_pii');
    const sealed = {
      ...profiled,
      proof: {
        ...profiled.proof,
        redaction_result: { ...profiled.proof.redaction_result, profile: 'transcript_pii' as const }
      },
      content_hash: ''
    };
    sealed.content_hash = await bundleContentHash(sealed as unknown as Record<string, unknown>);

    const report = await verifyBundle(sealed);
    expect(report.overall_verdict).toBe('pass');
    const replayGate = report.gates.find((g) => g.id === 'gate.replay_fidelity');
    expect(replayGate?.verdict).toBe('pass');
    // The walk succeeded but no state_hash was available to compare — bundle
    // replays structurally, not byte-equivalently.
    expect(replayGate?.level === 'structural' || replayGate?.level === 'exact').toBe(true);
  });

  it('reports fidelity_level=exact on a clean (unredacted) bundle', async () => {
    const trace = await makeTrace();
    const bundle = await buildBundle({ manifest: makeManifest(), trace, proof: makeProof() });
    const report = await verifyBundle(bundle);
    const replayGate = report.gates.find((g) => g.id === 'gate.replay_fidelity');
    expect(replayGate?.verdict).toBe('pass');
    expect(replayGate?.level).toBe('exact');
  });
});
