// Fixture scenario loader. Bundles the 5 canonical fixtures from
// workbench/fixtures/scenarios/ at build time via import.meta.glob so
// there is a single source of truth (the spec references that path).
//
// Each fixture is a "scenario description", not a pre-recorded trace.
// `loadFixtureIntoTeach` translates a fixture into initial Teach-page
// state: a seeded goal + body_choice + manifest-seed capabilities, plus
// a `script` of synthetic edges that may be appended to demonstrate
// fail-fast paths (e.g., the authority_denied fixture injects an edge
// tagged with an undeclared `&body.os` capability).

import type { BodyChoice, Capability } from './types';

export interface FixtureScenario {
  schema: string;
  id: string;
  purpose: string;
  body_choice: BodyChoice;
  task_prompt: string;
  inputs: Array<{ name: string; type: string; example?: unknown }>;
  expected_outputs_shape: Array<{ name: string; type: string }>;
  invariants_exercised: string[];
  proof_gates_exercised: string[];
  pass_criteria: {
    overall_verdict: 'pass' | 'fail' | 'partial' | 'inconclusive';
    fidelity_level?: string;
    must_deny?: string[];
    must_redact?: string[];
    min_models?: number;
    notes?: string;
  };
  capabilities_declared: Capability[];
  capabilities_attempted: Capability[];
  seeded_secrets?: string[];
}

// Vite bundles these JSON files at build time. Path is relative to this
// source file: workbench/app/src/lib/ -> ../../../fixtures/scenarios/*.json
const modules = import.meta.glob('../../../fixtures/scenarios/*.json', {
  eager: true,
  import: 'default'
}) as Record<string, FixtureScenario>;

export const FIXTURES: FixtureScenario[] = Object.values(modules).sort((a, b) =>
  a.id.localeCompare(b.id)
);

export function getFixture(id: string): FixtureScenario | undefined {
  return FIXTURES.find((f) => f.id === id);
}

// Per-fixture scripted edges to append after the user's first turn.
// Used to deterministically exercise the proof gates each fixture targets
// without requiring real bodies (browser / host).
//
// Each entry is a synthetic edge to splice into the trace at crystallize-time.
// For fixtures whose pass_criteria expect a clean run (basic, replay, redacted,
// model_comparison) there are no scripted edges — the user's chat steps are
// sufficient. The authority_denied fixture injects one undeclared-capability
// edge, which makes gate.no_hidden_capability + gate.authority fail (the
// CORRECT outcome per its pass_criteria).
export interface ScriptedEdge {
  kind: string;
  capability?: Capability;
  observation: unknown;
}

export function scriptedEdgesFor(id: string): ScriptedEdge[] {
  switch (id) {
    case 'skill.authority_denied':
      return [
        {
          kind: 'tool_call',
          capability: '&body.os',
          observation: {
            tool_call: { server: 'body-os', name: 'shell.exec', arguments: { cmd: 'echo trigger' } },
            note: 'undeclared capability invoked mid-trace — proof system MUST deny'
          }
        }
      ];
    default:
      return [];
  }
}
