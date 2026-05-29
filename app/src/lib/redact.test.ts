import { describe, it, expect } from 'vitest';
import { applyProfile, isIdempotent } from './redact';
import type { SkillBundle } from './types';

function makeBundle(observation: unknown): SkillBundle {
  return {
    bundle_version: '0.1.0',
    bundle_id: 'b1',
    skill_id: 's1',
    skill_version: 1,
    created_at: '2026-05-25T00:00:00Z',
    workbench_version: '0.1.0-alpha.0',
    manifest: {
      schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
      skill_id: 's1', name: 't', slug: 't', description: '', version: 1,
      derived_from_trace_id: 'tr', body_choice: 'simulator',
      inputs: [], outputs: [], preconditions: [], binding: 'portable',
      capabilities_required: ['ambient'], created_at: '', updated_at: ''
    },
    interaction_trace: {
      trace_id: 'tr',
      edges: [{ index: 0, ts: '2026-05-25T00:00:00Z', kind: 'user_message', observation }]
    },
    proof: {
      schema: 'https://opensentience.org/spec/proof-result/v0.1',
      verifier_version: '0.1', computed_at: '', overall_verdict: 'inconclusive',
      proof_gates: [], invariant_results: [],
      authority_result: { decision: 'allow' },
      redaction_result: { profile: 'none' },
      replay_result: { status: 'not_run', fidelity_level: 'inconclusive' },
      conformance_check: { spec_version: '0.1' }
    },
    evidence: {},
    content_hash: '',
    signature: null
  };
}

describe('redaction profile: none', () => {
  it('is a no-op', () => {
    const b = makeBundle({ content: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE' });
    expect(applyProfile(b, 'none')).toBe(b);
  });
});

describe('redaction profile: transcript_pii', () => {
  it('scrubs sk-style API keys', () => {
    const b = makeBundle({ content: 'My key is sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE end' });
    const out = applyProfile(b, 'transcript_pii');
    const text = (out.interaction_trace.edges[0] as { observation: { content: string } }).observation.content;
    expect(text).toBe('My key is [REDACTED_API_KEY] end');
  });

  it('scrubs email addresses', () => {
    const b = makeBundle({ content: 'email me at hi@example.com please' });
    const out = applyProfile(b, 'transcript_pii');
    const text = (out.interaction_trace.edges[0] as { observation: { content: string } }).observation.content;
    expect(text).toBe('email me at [REDACTED_EMAIL] please');
  });

  it('walks nested objects and arrays', () => {
    const b = makeBundle({ items: [{ note: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE' }] });
    const out = applyProfile(b, 'transcript_pii');
    const note = (out.interaction_trace.edges[0] as { observation: { items: { note: string }[] } })
      .observation.items[0].note;
    expect(note).toBe('[REDACTED_API_KEY]');
  });

  it('is idempotent on bundles with secrets', () => {
    const b = makeBundle({ content: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE and hi@example.com' });
    expect(isIdempotent(b, 'transcript_pii')).toBe(true);
  });

  it('is idempotent on bundles without secrets', () => {
    const b = makeBundle({ content: 'plain text' });
    expect(isIdempotent(b, 'transcript_pii')).toBe(true);
  });
});

describe('redaction profile: evidence subtree', () => {
  // builder.deriveEvidence packs the raw trace into bundle.evidence.trace so
  // PRISM can read it without parsing the bundle envelope. Without explicit
  // handling, redaction would leak secrets through evidence.trace.edges[*].observation
  // even though interaction_trace looked clean. This is the regression.
  it('redacts secrets inside evidence.trace.edges (transcript_pii)', () => {
    const b = makeBundle({ content: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE' });
    b.evidence = {
      schema: 'https://opensentience.org/spec/evidence-bundle/v0.1',
      trace: {
        trace_id: 'tr',
        edges: [{ index: 0, ts: '2026-05-25T00:00:00Z', kind: 'user_message',
          observation: { content: 'My key is sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKEFAKE' } }]
      }
    };
    const out = applyProfile(b, 'transcript_pii');
    const wire = JSON.stringify(out);
    expect(wire).not.toMatch(/sk-or-v1-FAKE/);
    expect(wire).toMatch(/\[REDACTED_API_KEY\]/);
  });

  it('drops observations inside evidence.trace.edges (full)', () => {
    const b = makeBundle({ content: 'anything' });
    b.evidence = {
      schema: 'https://opensentience.org/spec/evidence-bundle/v0.1',
      trace: {
        trace_id: 'tr',
        edges: [{ index: 0, ts: '2026-05-25T00:00:00Z', kind: 'user_message',
          state_hash: 'sha256:abc', observation: { content: 'anything' } }]
      }
    };
    const out = applyProfile(b, 'full');
    const evEdge = (out.evidence as { trace: { edges: Record<string, unknown>[] } }).trace.edges[0];
    expect(evEdge.observation).toBeUndefined();
    expect(evEdge.state_hash).toBeUndefined();
    expect(evEdge.kind).toBe('user_message');
  });
});

describe('redaction profile: full', () => {
  it('drops observation but keeps edge skeleton', () => {
    const b = makeBundle({ content: 'anything' });
    const out = applyProfile(b, 'full');
    const edge = out.interaction_trace.edges[0] as Record<string, unknown>;
    expect(edge.observation).toBeUndefined();
    expect(edge.index).toBe(0);
    expect(edge.kind).toBe('user_message');
    expect(edge.ts).toBe('2026-05-25T00:00:00Z');
  });

  it('is idempotent', () => {
    const b = makeBundle({ content: 'anything' });
    expect(isIdempotent(b, 'full')).toBe(true);
  });
});
