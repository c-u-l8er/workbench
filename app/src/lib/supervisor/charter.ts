// TeacherCharter loader + validator (Supervisor spec §2).
//
// Mirrors workbench/docs/spec/TEACHER_CHARTER.v0.schema.json. Pure TS — no Ajv
// dependency, identical philosophy to lib/manifest_validate.ts: the rule set
// is short, easy to read alongside the schema, and ships nothing extra.
//
// Charter content_hash is computed via lib/hash.bundleContentHash so it
// composes with the CurriculumBundle.charter_ref field exactly.

import { bundleContentHash } from '../hash';

export const TEACHER_CHARTER_SPEC_VERSION = '0.1' as const;

export type InvariantFamily =
  | 'topological'
  | 'temporal'
  | 'governance'
  | 'spatial'
  | 'deliberation'
  | 'attention'
  | 'evaluation'
  | 'security'
  | 'embodiment'
  | 'federation'
  | 'economic';

export const INVARIANT_FAMILIES: readonly InvariantFamily[] = [
  'topological',
  'temporal',
  'governance',
  'spatial',
  'deliberation',
  'attention',
  'evaluation',
  'security',
  'embodiment',
  'federation',
  'economic'
];

export type BodyChoice = 'simulator' | 'browser' | 'host';
export type RedactionProfile = 'none' | 'transcript_pii' | 'full';

export interface InvariantRef {
  table_uri: string;
  invariant_id: string;
  family: InvariantFamily;
  formal_definition?: string;
  proof_gate?: string;
}

export interface ManifestationDimension {
  dimension: string;
  values: string[];
}

export interface CharterBudget {
  max_skills: number;
  max_dollars?: number;
  max_seconds?: number;
  max_tokens?: number;
}

export interface CharterRubric {
  min_passing_gates: number;
  required_capabilities?: string[];
  forbidden_capabilities?: string[];
  redaction_profile?: RedactionProfile;
  coverage_target?: number;
}

export interface TeacherCharter {
  charter_id: string;
  spec_version: '0.1';
  name?: string;
  description?: string;
  invariant_ref: InvariantRef;
  manifestation_space: ManifestationDimension[];
  budget: CharterBudget;
  rubric: CharterRubric;
  body?: BodyChoice;
  model: string;
  critic_model?: string;
  delegatic?: boolean;
  fixture_seeds?: string[];
}

export interface CharterValidationError {
  path: string;
  message: string;
}

const ALLOWED_TOP_KEYS = new Set([
  'charter_id',
  'spec_version',
  'name',
  'description',
  'invariant_ref',
  'manifestation_space',
  'budget',
  'rubric',
  'body',
  'model',
  'critic_model',
  'delegatic',
  'fixture_seeds'
]);

const ALLOWED_INVARIANT_KEYS = new Set([
  'table_uri',
  'invariant_id',
  'family',
  'formal_definition',
  'proof_gate'
]);

const ALLOWED_BUDGET_KEYS = new Set(['max_skills', 'max_dollars', 'max_seconds', 'max_tokens']);

const ALLOWED_RUBRIC_KEYS = new Set([
  'min_passing_gates',
  'required_capabilities',
  'forbidden_capabilities',
  'redaction_profile',
  'coverage_target'
]);

const ALLOWED_DIM_KEYS = new Set(['dimension', 'values']);

const REDACTION_PROFILES = new Set(['none', 'transcript_pii', 'full']);
const BODY_CHOICES = new Set(['simulator', 'browser', 'host']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pushExtraneous(
  errors: CharterValidationError[],
  obj: Record<string, unknown>,
  allowed: Set<string>,
  path: string
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      errors.push({ path: `${path}.${k}`, message: 'unknown property' });
    }
  }
}

export function validateCharter(input: unknown): {
  ok: boolean;
  errors: CharterValidationError[];
  charter?: TeacherCharter;
} {
  const errors: CharterValidationError[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'charter must be a JSON object' }] };
  }

  pushExtraneous(errors, input, ALLOWED_TOP_KEYS, '');

  // charter_id
  if (typeof input.charter_id !== 'string' || input.charter_id.length < 1) {
    errors.push({ path: 'charter_id', message: 'required non-empty string' });
  }

  // spec_version
  if (input.spec_version !== TEACHER_CHARTER_SPEC_VERSION) {
    errors.push({
      path: 'spec_version',
      message: `must be "${TEACHER_CHARTER_SPEC_VERSION}"`
    });
  }

  // invariant_ref
  const inv = input.invariant_ref;
  if (!isObject(inv)) {
    errors.push({ path: 'invariant_ref', message: 'required object' });
  } else {
    pushExtraneous(errors, inv, ALLOWED_INVARIANT_KEYS, 'invariant_ref');
    if (typeof inv.table_uri !== 'string') {
      errors.push({ path: 'invariant_ref.table_uri', message: 'required string (URI)' });
    }
    if (typeof inv.invariant_id !== 'string' || (inv.invariant_id as string).length < 1) {
      errors.push({ path: 'invariant_ref.invariant_id', message: 'required non-empty string' });
    }
    if (typeof inv.family !== 'string' || !INVARIANT_FAMILIES.includes(inv.family as InvariantFamily)) {
      errors.push({
        path: 'invariant_ref.family',
        message: `must be one of ${INVARIANT_FAMILIES.join(', ')}`
      });
    }
    if (inv.formal_definition !== undefined && typeof inv.formal_definition !== 'string') {
      errors.push({ path: 'invariant_ref.formal_definition', message: 'must be string when present' });
    }
    if (inv.proof_gate !== undefined && typeof inv.proof_gate !== 'string') {
      errors.push({ path: 'invariant_ref.proof_gate', message: 'must be string when present' });
    }
  }

  // manifestation_space
  const space = input.manifestation_space;
  if (!Array.isArray(space) || space.length < 1) {
    errors.push({
      path: 'manifestation_space',
      message: 'required non-empty array of dimensions'
    });
  } else {
    const seenDims = new Set<string>();
    space.forEach((dim, i) => {
      const dimPath = `manifestation_space[${i}]`;
      if (!isObject(dim)) {
        errors.push({ path: dimPath, message: 'must be object' });
        return;
      }
      pushExtraneous(errors, dim, ALLOWED_DIM_KEYS, dimPath);
      if (typeof dim.dimension !== 'string' || (dim.dimension as string).length < 1) {
        errors.push({ path: `${dimPath}.dimension`, message: 'required non-empty string' });
      } else if (seenDims.has(dim.dimension as string)) {
        errors.push({
          path: `${dimPath}.dimension`,
          message: `duplicate dimension name "${dim.dimension as string}"`
        });
      } else {
        seenDims.add(dim.dimension as string);
      }
      if (!Array.isArray(dim.values) || dim.values.length < 1) {
        errors.push({ path: `${dimPath}.values`, message: 'required non-empty array' });
      } else {
        const seenVals = new Set<string>();
        (dim.values as unknown[]).forEach((v, j) => {
          if (typeof v !== 'string' || v.length < 1) {
            errors.push({
              path: `${dimPath}.values[${j}]`,
              message: 'must be non-empty string'
            });
          } else if (seenVals.has(v)) {
            errors.push({
              path: `${dimPath}.values[${j}]`,
              message: `duplicate value "${v}"`
            });
          } else {
            seenVals.add(v);
          }
        });
      }
    });
  }

  // budget
  const budget = input.budget;
  if (!isObject(budget)) {
    errors.push({ path: 'budget', message: 'required object' });
  } else {
    pushExtraneous(errors, budget, ALLOWED_BUDGET_KEYS, 'budget');
    if (!Number.isInteger(budget.max_skills) || (budget.max_skills as number) < 1) {
      errors.push({ path: 'budget.max_skills', message: 'required integer >= 1' });
    }
    if (budget.max_dollars !== undefined) {
      if (typeof budget.max_dollars !== 'number' || (budget.max_dollars as number) < 0) {
        errors.push({ path: 'budget.max_dollars', message: 'must be number >= 0' });
      }
    }
    if (budget.max_seconds !== undefined) {
      if (!Number.isInteger(budget.max_seconds) || (budget.max_seconds as number) < 1) {
        errors.push({ path: 'budget.max_seconds', message: 'must be integer >= 1' });
      }
    }
    if (budget.max_tokens !== undefined) {
      if (!Number.isInteger(budget.max_tokens) || (budget.max_tokens as number) < 1) {
        errors.push({ path: 'budget.max_tokens', message: 'must be integer >= 1' });
      }
    }
  }

  // rubric
  const rubric = input.rubric;
  if (!isObject(rubric)) {
    errors.push({ path: 'rubric', message: 'required object' });
  } else {
    pushExtraneous(errors, rubric, ALLOWED_RUBRIC_KEYS, 'rubric');
    if (
      !Number.isInteger(rubric.min_passing_gates) ||
      (rubric.min_passing_gates as number) < 1 ||
      (rubric.min_passing_gates as number) > 6
    ) {
      errors.push({
        path: 'rubric.min_passing_gates',
        message: 'required integer in [1, 6]'
      });
    }
    if (rubric.coverage_target !== undefined) {
      const ct = rubric.coverage_target as number;
      if (typeof ct !== 'number' || ct < 0 || ct > 1) {
        errors.push({ path: 'rubric.coverage_target', message: 'must be number in [0, 1]' });
      }
    }
    if (rubric.redaction_profile !== undefined) {
      if (!REDACTION_PROFILES.has(rubric.redaction_profile as string)) {
        errors.push({
          path: 'rubric.redaction_profile',
          message: 'must be one of none, transcript_pii, full'
        });
      }
    }
    for (const key of ['required_capabilities', 'forbidden_capabilities'] as const) {
      const arr = rubric[key];
      if (arr !== undefined) {
        if (!Array.isArray(arr) || arr.some((c) => typeof c !== 'string')) {
          errors.push({ path: `rubric.${key}`, message: 'must be array of strings' });
        }
      }
    }
  }

  // body
  if (input.body !== undefined && !BODY_CHOICES.has(input.body as string)) {
    errors.push({ path: 'body', message: 'must be one of simulator, browser, host' });
  }

  // model
  if (typeof input.model !== 'string' || (input.model as string).length < 1) {
    errors.push({ path: 'model', message: 'required non-empty string' });
  }

  // critic_model (optional)
  if (input.critic_model !== undefined) {
    if (typeof input.critic_model !== 'string' || (input.critic_model as string).length < 1) {
      errors.push({ path: 'critic_model', message: 'must be non-empty string when present' });
    }
  }

  // delegatic
  if (input.delegatic !== undefined && typeof input.delegatic !== 'boolean') {
    errors.push({ path: 'delegatic', message: 'must be boolean when present' });
  }

  // fixture_seeds
  if (input.fixture_seeds !== undefined) {
    if (!Array.isArray(input.fixture_seeds) || input.fixture_seeds.some((s) => typeof s !== 'string')) {
      errors.push({ path: 'fixture_seeds', message: 'must be array of strings when present' });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [], charter: input as TeacherCharter };
}

/**
 * Parse + validate a JSON string. Throws SyntaxError on bad JSON; returns the
 * same shape as validateCharter otherwise.
 */
export function parseCharter(jsonText: string): {
  ok: boolean;
  errors: CharterValidationError[];
  charter?: TeacherCharter;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: '', message: 'invalid JSON: ' + (e instanceof Error ? e.message : String(e)) }]
    };
  }
  return validateCharter(parsed);
}

/**
 * Content-hash a charter for use as CurriculumBundle.charter_ref. Hash is
 * computed over the canonical form of the charter exactly as supplied (no
 * fields stripped, since charter has no content_hash field of its own).
 */
export async function charterContentHash(charter: TeacherCharter): Promise<string> {
  return bundleContentHash(charter as unknown as Record<string, unknown>);
}
