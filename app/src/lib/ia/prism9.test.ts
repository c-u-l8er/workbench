// Tests for the PRISM-9 projection — verifies that a SkillBundle's IA-derived
// ProofResult maps onto the 9 continual-learning dimensions with the documented
// per-dimension semantics, default weights, null behavior, and weighted_total
// normalization.

import { describe, it, expect } from 'vitest';
import { projectPrism9, PRISM9_DIMENSIONS } from './prism9';
import type { ProofGate } from '../types';

function pass(id: ProofGate['id'], extra: Partial<ProofGate> = {}): ProofGate {
  return { id, verdict: 'pass', ...extra };
}
function fail(id: ProofGate['id'], extra: Partial<ProofGate> = {}): ProofGate {
  return { id, verdict: 'fail', ...extra };
}

const ALL_PASS_GATES: ProofGate[] = [
  pass('gate.authority'),
  pass('gate.trace_completeness'),
  pass('gate.replay_fidelity', { level: 'exact' }),
  pass('gate.redaction_verify'),
  pass('gate.content_hash'),
  pass('gate.no_hidden_capability')
];

describe('projectPrism9', () => {
  it('returns a vector with all 9 declared keys', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass' });
    for (const k of PRISM9_DIMENSIONS) {
      expect(k in v).toBe(true);
    }
    expect(v.weighted_total).toBeGreaterThan(0);
    expect(v.weights).toBeDefined();
    expect(v.derivation).toBeDefined();
  });

  it('all-pass bundle with exact replay yields a max-stability vector', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass', surprise_count: 0 });
    expect(v.stability_score).toBe(1);
    expect(v.plasticity_score).toBe(1);
    expect(v.knowledge_update_score).toBe(1);
    expect(v.temporal_score).toBe(1);
    expect(v.consolidation_score).toBeCloseTo(1.0, 5);
    expect(v.epistemic_awareness_score).toBe(1);
    expect(v.forgetting_score).toBe(1);
  });

  it('transfer and feedback are always null for a single bundle', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass' });
    expect(v.transfer_score).toBeNull();
    expect(v.feedback_score).toBeNull();
  });

  it('weighted_total normalizes over available weight mass (transfer+feedback null)', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass' });
    // With all 7 non-null dimensions = 1.0, weighted_total should be 1.0
    // (sum of non-null weights / sum of non-null weights = 1.0).
    expect(v.weighted_total).toBeCloseTo(1.0, 5);
  });

  it('default weights sum to 1.0 across all 9 dimensions', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass' });
    const total = Object.values(v.weights).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('stability drops when replay_fidelity fails', () => {
    const gates = ALL_PASS_GATES.map((g) =>
      g.id === 'gate.replay_fidelity' ? fail('gate.replay_fidelity', { level: 'failed' }) : g
    );
    const v = projectPrism9({ gates, overall_verdict: 'partial' });
    expect(v.stability_score).toBe(0);
    expect(v.temporal_score).toBe(0);
  });

  it('knowledge_update penalizes surprises', () => {
    const v0 = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass', surprise_count: 0 });
    const v1 = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass', surprise_count: 1 });
    const v3 = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass', surprise_count: 3 });
    expect(v0.knowledge_update_score).toBe(1);
    expect(v1.knowledge_update_score).toBeCloseTo(0.8, 5);
    // Penalty saturates at -0.6
    expect(v3.knowledge_update_score).toBeCloseTo(0.4, 5);
  });

  it('forgetting reflects gate.redaction_verify verdict', () => {
    const gates = ALL_PASS_GATES.map((g) =>
      g.id === 'gate.redaction_verify' ? fail('gate.redaction_verify') : g
    );
    const v = projectPrism9({ gates, overall_verdict: 'partial' });
    expect(v.forgetting_score).toBe(0);
  });

  it('epistemic_awareness reflects gate.no_hidden_capability verdict', () => {
    const gates = ALL_PASS_GATES.map((g) =>
      g.id === 'gate.no_hidden_capability' ? fail('gate.no_hidden_capability') : g
    );
    const v = projectPrism9({ gates, overall_verdict: 'partial' });
    expect(v.epistemic_awareness_score).toBe(0);
  });

  it('derivation explains each dimension and notes governance separately', () => {
    const v = projectPrism9({ gates: ALL_PASS_GATES, overall_verdict: 'pass' });
    expect(v.derivation.stability).toContain('gate.replay_fidelity');
    expect(v.derivation.transfer).toContain('null');
    expect(v.derivation.feedback).toContain('null');
    expect(v.derivation.governance_note).toContain('gate.authority');
  });
});
