// Surprise signal → Invariant Arithmetic law projection.
//
// OS-011 §5.4 names five surprise kinds. Each is the operational definition
// of a specific law refusing the replay step:
//
//   state_hash_mismatch  → L12/L14  (topological)
//       "the recorded observation didn't round-trip" = κ drifted.
//       consume({forward_only: true}) on a value with κ=true refuses.
//
//   affordance_drift     → L11/L14  (spatial)
//       "the action space shifted" = σ is not antitone under replay.
//       consume({sigma_empty: true}) on the symmetric difference refuses.
//
//   policy_deny          → L14      (governance)
//       "the body refused authority" = governance.deny_default kicked in.
//
//   model_refusal        → L14      (governance)
//       "the LLM rejected the step" = same governance refusal at the model.
//
//   other                → ungraded — no specific law cited.

import type { InvariantFamily } from '../types';

export type SurpriseKind =
  | 'state_hash_mismatch'
  | 'affordance_drift'
  | 'policy_deny'
  | 'model_refusal'
  | 'other';

export interface SurpriseProjection {
  law?: string;
  invariant_family?: InvariantFamily;
}

const TABLE: Record<SurpriseKind, SurpriseProjection> = {
  state_hash_mismatch: { law: 'L12/L14', invariant_family: 'topological' },
  affordance_drift: { law: 'L11/L14', invariant_family: 'spatial' },
  policy_deny: { law: 'L14', invariant_family: 'governance' },
  model_refusal: { law: 'L14', invariant_family: 'governance' },
  other: {}
};

export function projectSurprise(kind: SurpriseKind): SurpriseProjection {
  return TABLE[kind];
}
