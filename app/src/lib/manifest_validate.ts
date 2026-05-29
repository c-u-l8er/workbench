// Live SkillManifest field validation (spec §8.3 AC #6).
//
// Implements just the rules from SKILL_MANIFEST.v0.schema.json that the
// Teach UI lets the user edit — name, slug, description. The remaining
// schema fields are server-controlled (skill_id, derived_from_trace_id,
// timestamps, version, etc.) so we don't validate user-typed text against
// them on every keystroke.
//
// Keeping this rule set narrow and pure-TS (no Ajv dependency) is
// deliberate: the rules are short, easy to read alongside the schema,
// and don't ship a 200kB JSON-Schema engine for three fields.

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export interface ManifestFieldErrors {
  name?: string;
  slug?: string;
  description?: string;
}

export function validateManifestDraft(draft: {
  name: string;
  slug: string;
  description: string;
}): ManifestFieldErrors {
  const errors: ManifestFieldErrors = {};

  if (!draft.name.trim()) {
    errors.name = 'name is required';
  } else if (draft.name.length > 120) {
    errors.name = `name too long (${draft.name.length}/120)`;
  }

  if (!draft.slug.trim()) {
    errors.slug = 'slug is required';
  } else if (draft.slug.length > 80) {
    errors.slug = `slug too long (${draft.slug.length}/80)`;
  } else if (!SLUG_RE.test(draft.slug)) {
    errors.slug = 'slug must be lowercase a–z, 0–9, dashes; start and end alphanumeric';
  }

  if (!draft.description.trim()) {
    errors.description = 'description is required';
  } else if (draft.description.length > 2000) {
    errors.description = `description too long (${draft.description.length}/2000)`;
  }

  return errors;
}

export function hasErrors(errs: ManifestFieldErrors): boolean {
  return Object.keys(errs).length > 0;
}
