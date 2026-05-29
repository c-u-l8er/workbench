// Redaction profiles (spec §5.4 gate.redaction_verify + §7.4).
//
// Three profiles:
//   - 'none'            : no-op
//   - 'transcript_pii'  : strip API-key-shaped strings + email addresses
//                         from any string field reachable inside trace edges.
//                         Field-shape preserved (so replay can still walk edges).
//   - 'full'            : drop entire `observation` payloads, keep edge skeleton
//                         (index/ts/kind/state_hash). Used when publishing a
//                         bundle for third-party inspection.
//
// gate.redaction_verify is satisfied when:
//   (a) applying the profile to the trace produces stable JSON
//   (b) re-applying the profile is idempotent
//   (c) the recorded redaction_profile matches what was actually applied

import type { SkillBundle } from './types';

export type RedactionProfile = 'none' | 'transcript_pii' | 'full';

// Conservative PII patterns. These are intentionally narrow; we'd rather
// miss a real secret than corrupt a real observation. Bundles that need
// stricter handling should use 'full'.
const PATTERNS: Array<[RegExp, string]> = [
  // OpenRouter, OpenAI, Anthropic-style keys: sk-... with 20+ chars after.
  [/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
  // RFC-5322-ish emails (not RFC-perfect; we are conservative on purpose).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]']
];

function redactString(s: string): string {
  let out = s;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}

function walk(value: unknown, profile: RedactionProfile): unknown {
  if (profile === 'none') return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, profile));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, profile);
    }
    return out;
  }
  return value;
}

function redactEdges(
  edges: Array<Record<string, unknown>>,
  profile: RedactionProfile
): Array<Record<string, unknown>> {
  return edges.map((e) => {
    if (profile === 'full') {
      // Drop observation AND state_hash — the recipient cannot recompute the
      // hash from a payload they don't have. Replay can still walk the edge
      // skeleton; fidelity_level degrades from 'exact' to 'structural'.
      const { observation: _o, state_hash: _s, ...skeleton } = e;
      void _o;
      void _s;
      return skeleton;
    }
    // transcript_pii: walk observation tree. If the observation was actually
    // modified, the original state_hash no longer matches its content — strip
    // it so the recipient does not get a false replay_fidelity failure.
    if (e.observation === undefined) return e;
    const next = walk(e.observation, profile);
    if (JSON.stringify(next) === JSON.stringify(e.observation)) return e;
    const { state_hash: _s, ...rest } = e;
    void _s;
    return { ...rest, observation: next };
  });
}

export function applyProfile(bundle: SkillBundle, profile: RedactionProfile): SkillBundle {
  if (profile === 'none') return bundle;

  const redactedEdges = redactEdges(
    bundle.interaction_trace.edges as Array<Record<string, unknown>>,
    profile
  );

  // Evidence is a PRISM-facing re-projection of the same trace (see
  // builder.deriveEvidence). It must be redacted in lockstep with the trace,
  // otherwise raw observations leak through evidence.trace.edges[*].observation
  // even though interaction_trace looks clean.
  let redactedEvidence: unknown = bundle.evidence;
  if (bundle.evidence && typeof bundle.evidence === 'object') {
    const ev = bundle.evidence as Record<string, unknown>;
    const evTrace = ev.trace as Record<string, unknown> | undefined;
    if (evTrace && Array.isArray(evTrace.edges)) {
      redactedEvidence = {
        ...ev,
        trace: {
          ...evTrace,
          edges: redactEdges(evTrace.edges as Array<Record<string, unknown>>, profile)
        }
      };
    }
  }

  return {
    ...bundle,
    interaction_trace: { ...bundle.interaction_trace, edges: redactedEdges },
    evidence: redactedEvidence
  };
}

export function isIdempotent(bundle: SkillBundle, profile: RedactionProfile): boolean {
  const once = applyProfile(bundle, profile);
  const twice = applyProfile(once, profile);
  return (
    JSON.stringify(once.interaction_trace) === JSON.stringify(twice.interaction_trace) &&
    JSON.stringify(once.evidence) === JSON.stringify(twice.evidence)
  );
}
