// The 15 laws of Invariant Arithmetic v0.3, ported from
// AmpersandBoxDesign/reference/elixir/invariant_arithmetic/test/laws_test.exs
// and STACK_PROOF.html §II. Each law runs as a fast-check property at 1000
// trials per run — matching the Elixir test_helper.exs default.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  combine,
  chain,
  promote,
  reconcile,
  deliberate,
  consume,
  newValue,
  zero,
  PHASES,
  type Value,
  type Phase,
  type Requirements
} from './index';

// ---------------------------------------------------------------------------
// Generators (mirror test/support/generators.ex)
// ---------------------------------------------------------------------------

const TAG_POOL = [
  'source-A',
  'source-B',
  'source-C',
  'sensor-1',
  'sensor-2',
  'doc-X',
  'doc-Y',
  'q3-data',
  'q4-data'
];

const CADENCES = ['event-driven', 'periodic', 'batch'];

const phaseArb: fc.Arbitrary<Phase> = fc.constantFrom(...PHASES);

const betaArb: fc.Arbitrary<number> = fc
  .integer({ min: 0, max: 1000 })
  .map((x) => x / 1000);

const sigmaArb: fc.Arbitrary<string[]> = fc.uniqueArray(
  fc.constantFrom(...TAG_POOL),
  { maxLength: 3 }
);

const valueArb: fc.Arbitrary<Value> = fc
  .record({
    n: fc.integer({ min: 0, max: 999 }),
    kappa: fc.boolean(),
    beta: betaArb,
    sigma: sigmaArb,
    pi: fc.option(phaseArb, { nil: null }),
    iota: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
    psi: fc.option(fc.constantFrom(...CADENCES), { nil: null })
  })
  .map((r) =>
    newValue(r.n, {
      kappa: r.kappa,
      beta: r.beta,
      sigma: r.sigma,
      pi: r.pi,
      iota: r.iota,
      psi: r.psi
    })
  );

// Value restricted to the commutative subspace (no temporal/governance).
const commutativeValueArb: fc.Arbitrary<Value> = fc
  .record({
    n: fc.integer({ min: 0, max: 999 }),
    kappa: fc.boolean(),
    beta: betaArb,
    sigma: sigmaArb
  })
  .map((r) => newValue(r.n, r));

const backwardPair: fc.Arbitrary<[Phase, Phase]> = fc
  .integer({ min: 0, max: PHASES.length - 2 })
  .chain((ib) =>
    fc
      .integer({ min: ib + 1, max: PHASES.length - 1 })
      .map((ia) => [PHASES[ia], PHASES[ib]] as [Phase, Phase])
  );

const forwardPair: fc.Arbitrary<[Phase, Phase]> = fc
  .integer({ min: 0, max: PHASES.length - 1 })
  .chain((ia) =>
    fc
      .integer({ min: ia, max: PHASES.length - 1 })
      .map((ib) => [PHASES[ia], PHASES[ib]] as [Phase, Phase])
  );

// ---------------------------------------------------------------------------
// Equality helpers
// ---------------------------------------------------------------------------

function sigmaEq(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function valueEq(a: Value, b: Value): boolean {
  return (
    a.n === b.n &&
    a.topological.kappa === b.topological.kappa &&
    a.topological.beta === b.topological.beta &&
    sigmaEq(a.spatial.sigma, b.spatial.sigma) &&
    a.temporal.pi === b.temporal.pi &&
    a.temporal.iota === b.temporal.iota &&
    a.temporal.psi === b.temporal.psi &&
    a.governance.deny_default === b.governance.deny_default &&
    JSON.stringify(a.governance.authority_path) ===
      JSON.stringify(b.governance.authority_path) &&
    JSON.stringify(a.governance.audit) === JSON.stringify(b.governance.audit)
  );
}

function commutativeEq(a: Value, b: Value): boolean {
  return (
    a.n === b.n &&
    a.topological.kappa === b.topological.kappa &&
    a.topological.beta === b.topological.beta &&
    sigmaEq(a.spatial.sigma, b.spatial.sigma)
  );
}

const RUNS = { numRuns: 1000 };

// ---------------------------------------------------------------------------
// L1–L7 — `combine` is a monoid; commutative on the projection
// ---------------------------------------------------------------------------

describe('Invariant Arithmetic — combine is a monoid', () => {
  it('L1 — combine(zero, v) ≡ v', () => {
    fc.assert(
      fc.property(valueArb, (v) => valueEq(combine(zero(), v), v)),
      RUNS
    );
  });

  it('L2 — combine(v, zero) ≡ v', () => {
    fc.assert(
      fc.property(valueArb, (v) => valueEq(combine(v, zero()), v)),
      RUNS
    );
  });

  it('L3 — combine(combine(a, b), c) ≡ combine(a, combine(b, c))', () => {
    fc.assert(
      fc.property(valueArb, valueArb, valueArb, (a, b, c) =>
        valueEq(combine(combine(a, b), c), combine(a, combine(b, c)))
      ),
      RUNS
    );
  });

  it('L4 — commutative on n × κ × β × σ', () => {
    fc.assert(
      fc.property(commutativeValueArb, commutativeValueArb, (a, b) =>
        commutativeEq(combine(a, b), combine(b, a))
      ),
      RUNS
    );
  });

  it('L5 — combine(a, a).κ ≡ a.κ', () => {
    fc.assert(
      fc.property(
        valueArb,
        (a) => combine(a, a).topological.kappa === a.topological.kappa
      ),
      RUNS
    );
  });

  it('L6 — combine(a, a).β ≡ a.β', () => {
    fc.assert(
      fc.property(
        valueArb,
        // min(x, x) = x is exact in IEEE 754, so === is safe.
        (a) => combine(a, a).topological.beta === a.topological.beta
      ),
      RUNS
    );
  });

  it('L7 — combine(a, a).σ ≡ a.σ', () => {
    fc.assert(
      fc.property(valueArb, (a) =>
        sigmaEq(combine(a, a).spatial.sigma, a.spatial.sigma)
      ),
      RUNS
    );
  });
});

// ---------------------------------------------------------------------------
// L8–L9 — `chain` is the phase-graded composition
// ---------------------------------------------------------------------------

describe('Invariant Arithmetic — chain is phase-graded', () => {
  it('L8 — phase(a) > phase(b) ⇒ chain refuses with π-violation', () => {
    fc.assert(
      fc.property(backwardPair, ([pa, pb]) => {
        const a = newValue(1, { pi: pa });
        const b = newValue(1, { pi: pb });
        const r = chain(a, b);
        return r.ok === false && r.violation.invariant === 'pi';
      }),
      RUNS
    );
  });

  it('L9 — phase(a) ≤ phase(b) ⇒ chain succeeds', () => {
    fc.assert(
      fc.property(forwardPair, ([pa, pb]) => {
        const a = newValue(1, { pi: pa });
        const b = newValue(1, { pi: pb });
        return chain(a, b).ok === true;
      }),
      RUNS
    );
  });
});

// ---------------------------------------------------------------------------
// L10–L13 — unary ops obey their algebraic shape
// ---------------------------------------------------------------------------

describe('Invariant Arithmetic — unary op algebra', () => {
  it('L10 — promote(v).β ≥ v.β', () => {
    fc.assert(
      fc.property(valueArb, betaArb, (v, t) =>
        promote(v, { raises_to: t }).topological.beta >= v.topological.beta
      ),
      RUNS
    );
  });

  it('L11 — reconcile(v, T).σ ⊆ v.σ', () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        const drop = [...v.spatial.sigma].slice(0, 1);
        const result = reconcile(v, drop).spatial.sigma;
        for (const t of result) if (!v.spatial.sigma.has(t)) return false;
        return true;
      }),
      RUNS
    );
  });

  it('L12 — deliberate(v).κ ≡ false', () => {
    fc.assert(
      fc.property(valueArb, (v) => deliberate(v).topological.kappa === false),
      RUNS
    );
  });

  it('L13 — reconcile(reconcile(v, T), T) ≡ reconcile(v, T)', () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        const drop = [...v.spatial.sigma].slice(0, 2);
        const once = reconcile(v, drop);
        const twice = reconcile(once, drop);
        return valueEq(once, twice);
      }),
      RUNS
    );
  });
});

// ---------------------------------------------------------------------------
// L14–L15 — `consume` soundness and the refusal-recovery duality
// ---------------------------------------------------------------------------

describe('Invariant Arithmetic — consume soundness and recovery', () => {
  const reqArb: fc.Arbitrary<Requirements> = fc
    .record({
      use_beta: fc.boolean(),
      beta: betaArb,
      use_sigma: fc.boolean(),
      use_forward: fc.boolean()
    })
    .map((o) => {
      const r: Requirements = {};
      if (o.use_beta) r.beta_min = o.beta;
      if (o.use_sigma) r.sigma_empty = true;
      if (o.use_forward) r.forward_only = true;
      return r;
    });

  it('L14 — consume(v, req).ok ⇒ v really satisfies req', () => {
    fc.assert(
      fc.property(valueArb, reqArb, (v, req) => {
        const result = consume(v, req);
        if (!result.ok) return true;
        if (req.beta_min !== undefined && v.topological.beta < req.beta_min) {
          return false;
        }
        if (req.sigma_empty === true && v.spatial.sigma.size !== 0) {
          return false;
        }
        if (req.forward_only === true && v.topological.kappa === true) {
          return false;
        }
        return true;
      }),
      RUNS
    );
  });

  it('L15 — consume σ-refusal is fixable by reconcile', () => {
    const v = newValue(1, { sigma: ['t1', 't2'] });
    expect(consume(v, { sigma_empty: true }).ok).toBe(false);
    const cleaned = reconcile(v, v.spatial.sigma);
    expect(consume(cleaned, { sigma_empty: true }).ok).toBe(true);
  });
});
