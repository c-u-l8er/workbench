// Componentwise monoid composition of values.
//
// `combine` is associative with `zero()` as both left and right identity.
// It is NOT commutative — temporal first-non-nil and governance list-concat
// observe order — but its `n × κ × β × σ × deny_default` projection IS
// commutative (see L4).

import type { Value } from './value';

function firstNonNil<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a != null) return a;
  if (b != null) return b;
  return null;
}

export function combine(a: Value, b: Value): Value {
  const sigma = new Set<string>(a.spatial.sigma);
  for (const tag of b.spatial.sigma) sigma.add(tag);

  return {
    n: a.n + b.n,
    topological: {
      kappa: a.topological.kappa || b.topological.kappa,
      beta: Math.min(a.topological.beta, b.topological.beta)
    },
    spatial: { sigma },
    temporal: {
      pi: firstNonNil(a.temporal.pi, b.temporal.pi),
      iota: firstNonNil(a.temporal.iota, b.temporal.iota),
      psi: firstNonNil(a.temporal.psi, b.temporal.psi)
    },
    governance: {
      authority_path: [
        ...a.governance.authority_path,
        ...b.governance.authority_path
      ],
      deny_default: a.governance.deny_default && b.governance.deny_default,
      audit: [...a.governance.audit, ...b.governance.audit]
    }
  };
}
