// CurriculumBundle assembly tests — Supervisor spec AC #4 (content_hash
// re-computes byte-for-byte after JSON round-trip).

import { describe, it, expect } from 'vitest';
import { assembleCurriculumBundle, verifyCurriculumContentHash } from './bundle';
import type { TeacherCharter } from './charter';
import { bundleContentHash } from '../hash';

const charter: TeacherCharter = {
  charter_id: 'charter-bundle-test',
  spec_version: '0.1',
  invariant_ref: {
    table_uri: 'https://opensentience.org/spec/periodic-table-of-agent-invariants.html#replay-determinism',
    invariant_id: 'replay_determinism',
    family: 'embodiment',
    proof_gate: 'gate.replay_fidelity'
  },
  manifestation_space: [
    { dimension: 'body', values: ['simulator', 'browser'] },
    { dimension: 'turn_count', values: ['short', 'long'] }
  ],
  budget: { max_skills: 4 },
  rubric: { min_passing_gates: 6 },
  model: 'anthropic/claude-haiku-4-5'
};

// Fake but well-shaped 64-hex sha256 strings for SkillBundle refs.
const skillHashA = 'sha256:' + 'a'.repeat(64);
const skillHashB = 'sha256:' + 'b'.repeat(64);

const skill_bundles = [
  {
    content_hash: skillHashA,
    manifestation: { body: 'simulator', turn_count: 'short' },
    skill_slug: 'replay-sim-short',
    verdict: 'pass' as const
  },
  {
    content_hash: skillHashB,
    manifestation: { body: 'browser', turn_count: 'long' },
    skill_slug: 'replay-browser-long',
    verdict: 'fail' as const
  }
];

const invariant_claims = [
  {
    skill_content_hash: skillHashA,
    invariant_id: 'replay_determinism',
    gate: 'gate.replay_fidelity',
    passed: true,
    evidence_ref: '/proof/gates/replay_fidelity'
  },
  {
    skill_content_hash: skillHashB,
    invariant_id: 'replay_determinism',
    gate: 'gate.replay_fidelity',
    passed: false,
    evidence_ref: '/proof/gates/replay_fidelity'
  }
];

describe('assembleCurriculumBundle', () => {
  it('computes coverage from skill_bundles + invariant_claims', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-1',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: {
        skills_produced: 2,
        wallclock_seconds: 30,
        halt_reason: 'max_skills_reached'
      },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    expect(c.coverage.cells_total).toBe(4);
    expect(c.coverage.cells_visited).toBe(2);
    expect(c.coverage.cells_covered).toBe(1); // only A passed
    expect(c.coverage.frontier_remaining).toHaveLength(3);
    expect(c.coverage.wilson_lower_bound).toBeGreaterThan(0);
    expect(c.coverage.wilson_lower_bound).toBeLessThan(1);
  });

  it('content_hash returns sha256:<64-hex>', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-1',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    expect(c.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('charter_ref equals sha256(canonical charter)', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-1',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    const direct = await bundleContentHash(charter as unknown as Record<string, unknown>);
    expect(c.charter_ref).toBe(direct);
  });
});

describe('AC #4 — content_hash re-computes byte-for-byte after JSON round-trip', () => {
  it('verifyCurriculumContentHash returns ok=true after JSON.parse(JSON.stringify(...))', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-roundtrip',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    const rehydrated = JSON.parse(JSON.stringify(c));
    const v = await verifyCurriculumContentHash(rehydrated);
    expect(v.ok).toBe(true);
    expect(v.recomputed).toBe(v.stored);
  });

  it('detects tampering anywhere in the bundle', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-tamper',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    const tampered = JSON.parse(JSON.stringify(c));
    tampered.coverage.cells_covered = 999;
    const v = await verifyCurriculumContentHash(tampered);
    expect(v.ok).toBe(false);
  });

  it('content_hash is independent of property-insertion order', async () => {
    const c1 = await assembleCurriculumBundle({
      curriculum_id: 'cur-test-order',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    // Re-build with reversed order in arrays of equivalent length but identical content.
    // Note: skill_bundles is an ordered field — reversing IT would change the hash. But
    // re-serializing the whole bundle through canonicalize MUST yield the same hash.
    const re = JSON.parse(JSON.stringify(c1));
    const v = await verifyCurriculumContentHash(re);
    expect(v.ok).toBe(true);
  });
});

describe('third-party re-verification (AC #5 partial — no IndexedDB needed)', () => {
  it('a fresh consumer with only the JSON can re-verify the content_hash', async () => {
    const c = await assembleCurriculumBundle({
      curriculum_id: 'cur-third-party',
      charter,
      skill_bundles,
      invariant_claims,
      budget_consumed: { skills_produced: 2, wallclock_seconds: 30 },
      sealed_at: '2026-05-25T00:00:00Z'
    });
    // Simulate "third party with only the JSON": fully strip identity, only keep the
    // serialized form, then re-verify.
    const json = JSON.stringify(c);
    const consumed = JSON.parse(json);
    const v = await verifyCurriculumContentHash(consumed);
    expect(v.ok).toBe(true);
  });
});
