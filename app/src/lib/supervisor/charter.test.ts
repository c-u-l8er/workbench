// Charter validator tests — Supervisor spec AC #1 / #2.

import { describe, it, expect } from 'vitest';
import { validateCharter, parseCharter, charterContentHash } from './charter';

const minValid = {
  charter_id: 'charter-test-001',
  spec_version: '0.1',
  invariant_ref: {
    table_uri: 'https://opensentience.org/spec/periodic-table-of-agent-invariants.html#replay-determinism',
    invariant_id: 'replay_determinism',
    family: 'embodiment'
  },
  manifestation_space: [{ dimension: 'body', values: ['simulator', 'browser'] }],
  budget: { max_skills: 1 },
  rubric: { min_passing_gates: 6 },
  model: 'anthropic/claude-haiku-4-5'
};

describe('validateCharter — AC #1 (valid charter validates)', () => {
  it('accepts a minimal valid charter', () => {
    const r = validateCharter(minValid);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.charter?.charter_id).toBe('charter-test-001');
  });

  it('accepts the worked example from spec §2.3', () => {
    const example = {
      ...minValid,
      name: 'Replay determinism across bodies and redaction',
      invariant_ref: {
        ...minValid.invariant_ref,
        formal_definition: 'For every edge ...',
        proof_gate: 'gate.replay_fidelity'
      },
      manifestation_space: [
        { dimension: 'body', values: ['simulator', 'browser'] },
        { dimension: 'turn_count', values: ['single', 'short', 'long'] },
        { dimension: 'redaction_profile', values: ['none', 'transcript_pii', 'full'] },
        { dimension: 'state_mutation', values: ['pure', 'side_effecting'] }
      ],
      budget: { max_skills: 12, max_dollars: 1.5, max_seconds: 900 },
      rubric: {
        min_passing_gates: 6,
        required_capabilities: ['&model.text'],
        forbidden_capabilities: ['&body.os'],
        coverage_target: 0.7
      },
      body: 'simulator',
      delegatic: true
    };
    const r = validateCharter(example);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('validateCharter — AC #2 (invalid charter fails with clear error)', () => {
  it('rejects non-object input', () => {
    expect(validateCharter(null).ok).toBe(false);
    expect(validateCharter('string').ok).toBe(false);
    expect(validateCharter([]).ok).toBe(false);
  });

  it('reports missing required fields with paths', () => {
    const r = validateCharter({});
    expect(r.ok).toBe(false);
    const paths = r.errors.map((e) => e.path);
    expect(paths).toContain('charter_id');
    expect(paths).toContain('spec_version');
    expect(paths).toContain('invariant_ref');
    expect(paths).toContain('manifestation_space');
    expect(paths).toContain('budget');
    expect(paths).toContain('rubric');
    expect(paths).toContain('model');
  });

  it('reports a single missing field with a clear path', () => {
    const { invariant_ref, ...rest } = minValid;
    void invariant_ref;
    const r = validateCharter(rest);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'invariant_ref')).toBeDefined();
  });

  it('rejects bad spec_version', () => {
    const r = validateCharter({ ...minValid, spec_version: '0.2' });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'spec_version')).toBeDefined();
  });

  it('rejects unknown invariant family', () => {
    const r = validateCharter({
      ...minValid,
      invariant_ref: { ...minValid.invariant_ref, family: 'mystery' }
    });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'invariant_ref.family')).toBeDefined();
  });

  it('rejects empty manifestation_space', () => {
    const r = validateCharter({ ...minValid, manifestation_space: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'manifestation_space')).toBeDefined();
  });

  it('rejects duplicate dimension names', () => {
    const r = validateCharter({
      ...minValid,
      manifestation_space: [
        { dimension: 'body', values: ['simulator'] },
        { dimension: 'body', values: ['browser'] }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'manifestation_space[1].dimension')).toBeDefined();
  });

  it('rejects duplicate values in a dimension', () => {
    const r = validateCharter({
      ...minValid,
      manifestation_space: [{ dimension: 'body', values: ['simulator', 'simulator'] }]
    });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'manifestation_space[0].values[1]')).toBeDefined();
  });

  it('rejects max_skills < 1', () => {
    const r = validateCharter({ ...minValid, budget: { max_skills: 0 } });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'budget.max_skills')).toBeDefined();
  });

  it('rejects min_passing_gates outside [1, 6]', () => {
    const r1 = validateCharter({ ...minValid, rubric: { min_passing_gates: 0 } });
    expect(r1.ok).toBe(false);
    const r2 = validateCharter({ ...minValid, rubric: { min_passing_gates: 7 } });
    expect(r2.ok).toBe(false);
  });

  it('rejects coverage_target outside [0, 1]', () => {
    const r = validateCharter({
      ...minValid,
      rubric: { min_passing_gates: 6, coverage_target: 1.1 }
    });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'rubric.coverage_target')).toBeDefined();
  });

  it('rejects unknown body', () => {
    const r = validateCharter({ ...minValid, body: 'mainframe' });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === 'body')).toBeDefined();
  });

  it('rejects unknown top-level properties', () => {
    const r = validateCharter({ ...minValid, mystery_field: 42 });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === '.mystery_field')).toBeDefined();
  });
});

describe('parseCharter', () => {
  it('reports invalid JSON cleanly', () => {
    const r = parseCharter('{not json');
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/invalid JSON/);
  });

  it('accepts valid JSON of a valid charter', () => {
    const r = parseCharter(JSON.stringify(minValid));
    expect(r.ok).toBe(true);
  });
});

describe('charterContentHash', () => {
  it('returns sha256:<64-hex>', async () => {
    const h = await charterContentHash(minValid as never);
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is stable across property-insertion order', async () => {
    const a = { ...minValid };
    const b = {
      model: minValid.model,
      rubric: minValid.rubric,
      budget: minValid.budget,
      manifestation_space: minValid.manifestation_space,
      invariant_ref: minValid.invariant_ref,
      spec_version: minValid.spec_version,
      charter_id: minValid.charter_id
    };
    expect(await charterContentHash(a as never)).toBe(await charterContentHash(b as never));
  });
});
