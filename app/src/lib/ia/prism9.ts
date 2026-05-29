// PRISM-9 projection — map a SkillBundle's IA-derived ProofResult onto the
// 9 continual learning dimensions that PRISM consumes.
//
// Authoritative source: opensentience.org/docs/spec/OS-009-PRISM-SPECIFICATION.md
// (and PRISM/lib/prism/judgment.ex @valid_dimensions). The 9 dimensions and
// their default weights (sum to 1.0):
//
//   stability            0.20   anti-forgetting (retain old when new arrives)
//   plasticity           0.18   new acquisition speed + accuracy
//   knowledge_update     0.15   detect + resolve contradictions
//   temporal             0.12   when things happened, what's current
//   consolidation        0.10   compress episodes into insights
//   epistemic_awareness  0.08   knowing what you don't know
//   transfer             0.07   knowledge in A → improves B
//   forgetting           0.05   deliberate pruning, GDPR, policy decay
//   feedback             0.05   retrieval improves from downstream signals
//
// A single SkillBundle is one teach+verify cycle, not a continual-learning
// trajectory. So four dimensions (stability, plasticity, epistemic_awareness,
// forgetting) are well-grounded from gate verdicts; three are best-effort
// approximations from related gates (knowledge_update, temporal, consolidation);
// and two (transfer, feedback) require a multi-skill sequence and return
// `null` from a single bundle. This is intentional and documented per-key.
//
// PRISM consumes a `Prism9Vector` as one row in its leaderboard table; the
// nulls become NaNs/zeros downstream. The `weighted_total` here only sums
// the non-null dimensions and divides by their weight mass — so a bundle
// missing transfer + feedback yields a weighted total over the 0.88 of
// weight mass that IS measurable.

import type { ProofGate, FidelityLevel, Verdict } from '../types';

export interface Prism9Vector {
  stability_score: number;
  plasticity_score: number;
  knowledge_update_score: number;
  temporal_score: number;
  consolidation_score: number;
  epistemic_awareness_score: number;
  transfer_score: number | null;
  forgetting_score: number;
  feedback_score: number | null;
  /** Weighted sum over non-null dimensions only, normalized to [0, 1]. */
  weighted_total: number;
  /** The PRISM-9 weights used to compute weighted_total (caller-overridable). */
  weights: Record<keyof Omit<Prism9Vector, 'weighted_total' | 'weights' | 'derivation'>, number>;
  /** Per-dimension provenance — which gate(s) contributed and how. */
  derivation: Record<string, string>;
}

const DEFAULT_WEIGHTS = {
  stability_score: 0.20,
  plasticity_score: 0.18,
  knowledge_update_score: 0.15,
  temporal_score: 0.12,
  consolidation_score: 0.10,
  epistemic_awareness_score: 0.08,
  transfer_score: 0.07,
  forgetting_score: 0.05,
  feedback_score: 0.05
} as const;

function gate(gates: ProofGate[], id: string): ProofGate | undefined {
  return gates.find((g) => g.id === id);
}

function verdictScore(v: Verdict | 'n/a' | undefined): number {
  if (v === 'pass') return 1.0;
  if (v === 'partial') return 0.5;
  if (v === 'fail') return 0.0;
  return 0.5; // 'inconclusive' or 'n/a'
}

function fidelityScore(level: FidelityLevel | undefined): number {
  switch (level) {
    case 'exact':        return 1.0;
    case 'structural':   return 0.85;
    case 'semantic':     return 0.7;
    case 'inconclusive': return 0.5;
    case 'failed':       return 0.0;
    default:             return 0.5;
  }
}

export interface ProjectArgs {
  gates: ProofGate[];
  overall_verdict: Verdict;
  /** Replay surprise count, if known. 0 with replay successful → high knowledge_update score. */
  surprise_count?: number;
}

export function projectPrism9(args: ProjectArgs): Prism9Vector {
  const { gates, overall_verdict, surprise_count } = args;

  const gReplay = gate(gates, 'gate.replay_fidelity');
  const gTrace = gate(gates, 'gate.trace_completeness');
  const gAuth = gate(gates, 'gate.authority');
  const gNoHidden = gate(gates, 'gate.no_hidden_capability');
  const gHash = gate(gates, 'gate.content_hash');
  const gRedact = gate(gates, 'gate.redaction_verify');

  // stability — gate.replay_fidelity is the direct anti-forgetting signal.
  // A bundle that replays exact has retained its recorded knowledge perfectly.
  const stability_score = gReplay
    ? Math.min(verdictScore(gReplay.verdict), fidelityScore(gReplay.level))
    : 0.5;

  // plasticity — did the agent successfully crystallize a new skill?
  // Combines overall_verdict with gate.trace_completeness (no broken edges).
  const plasticity_score = (verdictScore(overall_verdict) + verdictScore(gTrace?.verdict)) / 2;

  // knowledge_update — detecting and resolving contradictions. With no
  // recorded surprises and content_hash passing, the bundle was internally
  // consistent. Surprises lower this score proportionally.
  const knowledge_update_score = (() => {
    const base = verdictScore(gHash?.verdict);
    if (surprise_count === undefined) return base;
    if (surprise_count === 0) return base;
    // Saturating penalty: 1 surprise → -0.2, capped at -0.6
    return Math.max(0, base - Math.min(0.6, 0.2 * surprise_count));
  })();

  // temporal — phase ordering and "what's current". v0.3 doesn't yet wire
  // chain() into the trace builder (M6), so we read replay_fidelity.level as
  // a proxy: an exact replay implies the recorded timestamp order was
  // honored when the trace was executed. Will be tightened by M6.
  const temporal_score = fidelityScore(gReplay?.level);

  // consolidation — for a single bundle, trace_completeness is the closest
  // signal: the trace canonicalizes cleanly with no broken edges. This is
  // a weak proxy. PRISM scores consolidation across many sessions; one
  // bundle can only show "this episode was well-formed."
  const consolidation_score = verdictScore(gTrace?.verdict) * 0.7 + 0.3;

  // epistemic_awareness — did the agent only use declared capabilities?
  // gate.no_hidden_capability is the direct calibration signal: an agent
  // that smuggled in an undeclared capability didn't know its own limits.
  const epistemic_awareness_score = verdictScore(gNoHidden?.verdict);

  // transfer — requires a multi-skill sequence. Single bundle: null.
  const transfer_score = null;

  // forgetting — gate.redaction_verify directly measures whether the bundle
  // can correctly apply forgetting policies (PII strip + post-hash invariance).
  const forgetting_score = verdictScore(gRedact?.verdict);

  // feedback — requires retrieval improving over time. Single bundle: null.
  const feedback_score = null;

  // weighted_total — sum non-null dimension*weight, divide by available
  // weight mass so a bundle missing 2/9 dimensions doesn't get unfairly
  // penalized vs. a full continual-learning trace.
  let num = 0;
  let den = 0;
  const allDims = {
    stability_score,
    plasticity_score,
    knowledge_update_score,
    temporal_score,
    consolidation_score,
    epistemic_awareness_score,
    transfer_score,
    forgetting_score,
    feedback_score
  };
  for (const [k, v] of Object.entries(allDims) as [keyof typeof DEFAULT_WEIGHTS, number | null][]) {
    if (v === null) continue;
    const w = DEFAULT_WEIGHTS[k];
    num += v * w;
    den += w;
  }
  const weighted_total = den === 0 ? 0 : num / den;

  // Authority is captured in derivation only; it doesn't map to one of the
  // PRISM-9 dimensions cleanly — it's an OS-006 governance gate, while
  // PRISM-9 measures cognitive dimensions. We surface it in derivation so a
  // reader of the vector knows authority was checked too.
  const derivation: Record<string, string> = {
    stability:           `gate.replay_fidelity verdict=${gReplay?.verdict} · level=${gReplay?.level}`,
    plasticity:          `mean(overall=${overall_verdict}, gate.trace_completeness=${gTrace?.verdict})`,
    knowledge_update:    `gate.content_hash=${gHash?.verdict}${surprise_count !== undefined ? ` · surprises=${surprise_count}` : ''}`,
    temporal:            `gate.replay_fidelity.level=${gReplay?.level} (M6 chain integration pending)`,
    consolidation:       `gate.trace_completeness=${gTrace?.verdict} (weak proxy for multi-session abstraction)`,
    epistemic_awareness: `gate.no_hidden_capability=${gNoHidden?.verdict}`,
    transfer:            'null — requires multi-skill sequence',
    forgetting:          `gate.redaction_verify=${gRedact?.verdict}`,
    feedback:            'null — requires retrieval quality time-series',
    governance_note:     `gate.authority=${gAuth?.verdict} (OS-006; not one of the PRISM-9 cognitive dimensions)`
  };

  return {
    stability_score,
    plasticity_score,
    knowledge_update_score,
    temporal_score,
    consolidation_score,
    epistemic_awareness_score,
    transfer_score,
    forgetting_score,
    feedback_score,
    weighted_total,
    weights: { ...DEFAULT_WEIGHTS },
    derivation
  };
}

/**
 * The 9 dimension keys in PRISM weight order (highest to lowest weight).
 * Stable order — UIs and downstream consumers can iterate over this.
 */
export const PRISM9_DIMENSIONS = [
  'stability_score',
  'plasticity_score',
  'knowledge_update_score',
  'temporal_score',
  'consolidation_score',
  'epistemic_awareness_score',
  'transfer_score',
  'forgetting_score',
  'feedback_score'
] as const;
