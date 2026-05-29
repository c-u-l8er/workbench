// The substrate's value — a product of monoids over four families.
//
// | Family       | Field                       | Monoid       | Identity        |
// |--------------|-----------------------------|--------------|-----------------|
// | numeric      | `n`                         | +            | 0               |
// | topological  | `topological.kappa`         | or           | false           |
// | topological  | `topological.beta`          | min          | 1.0             |
// | spatial      | `spatial.sigma`             | set ∪        | ∅               |
// | temporal     | `temporal.{pi,iota,psi}`    | first-non-nil| null            |
// | governance   | `governance.authority_path` | ++           | []              |
// | governance   | `governance.deny_default`   | and          | true            |
// | governance   | `governance.audit`          | ++           | []              |
//
// The product of monoids is itself a monoid. The temporal and governance
// components are non-commutative; combine is associative but not commutative.
// Values are immutable plain objects — every operation returns a fresh Value.

import type { Phase } from './phase';

export type AuditEntry = Readonly<Record<string, unknown>>;

export interface Value {
  readonly n: number;
  readonly topological: {
    readonly kappa: boolean;
    readonly beta: number;
  };
  readonly spatial: {
    readonly sigma: ReadonlySet<string>;
  };
  readonly temporal: {
    readonly pi: Phase | null;
    readonly iota: string | null;
    readonly psi: string | null;
  };
  readonly governance: {
    readonly authority_path: readonly string[];
    readonly deny_default: boolean;
    readonly audit: readonly AuditEntry[];
  };
}

export interface ValueOpts {
  kappa?: boolean;
  beta?: number;
  sigma?: Iterable<string>;
  pi?: Phase | null;
  iota?: string | null;
  psi?: string | null;
  authority_path?: readonly string[];
  deny_default?: boolean;
  audit?: readonly AuditEntry[];
}

/**
 * Build a value. Missing opts take their monoid identity.
 *
 * @example
 *   newValue(100, { beta: 0.95, pi: 'retrieve', sigma: ['src-A'] })
 */
export function newValue(n: number = 0, opts: ValueOpts = {}): Value {
  return {
    n,
    topological: {
      kappa: opts.kappa ?? false,
      beta: opts.beta ?? 1.0
    },
    spatial: {
      sigma: new Set(opts.sigma ?? [])
    },
    temporal: {
      pi: opts.pi ?? null,
      iota: opts.iota ?? null,
      psi: opts.psi ?? null
    },
    governance: {
      authority_path: opts.authority_path ?? [],
      deny_default: opts.deny_default ?? true,
      audit: opts.audit ?? []
    }
  };
}

/** The monoid identity. Equivalent to `newValue(0)`. */
export function zero(): Value {
  return newValue(0);
}

export const ZERO: Value = zero();

// --- Phase-tagged constructors --------------------------------------------
// Each sets π only when caller did not specify it explicitly (mirrors
// Keyword.put_new in the Elixir port).

export function retrieval(n: number = 0, opts: ValueOpts = {}): Value {
  return newValue(n, { ...opts, pi: opts.pi ?? 'retrieve' });
}

export function decision(n: number = 0, opts: ValueOpts = {}): Value {
  return newValue(n, { ...opts, pi: opts.pi ?? 'route' });
}

export function action(n: number = 0, opts: ValueOpts = {}): Value {
  return newValue(n, { ...opts, pi: opts.pi ?? 'act' });
}

export function learning(n: number = 0, opts: ValueOpts = {}): Value {
  return newValue(n, { ...opts, pi: opts.pi ?? 'learn' });
}

export function consolidation(n: number = 0, opts: ValueOpts = {}): Value {
  return newValue(n, { ...opts, pi: opts.pi ?? 'consolidate' });
}
