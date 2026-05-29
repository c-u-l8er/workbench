import { describe, it, expect } from 'vitest';
import { validateManifestDraft, hasErrors } from './manifest_validate';

describe('validateManifestDraft', () => {
  it('passes on a clean draft', () => {
    const errs = validateManifestDraft({ name: 'My Skill', slug: 'my-skill', description: 'Greet users by name.' });
    expect(hasErrors(errs)).toBe(false);
  });

  it('flags empty name', () => {
    const errs = validateManifestDraft({ name: '   ', slug: 'ok', description: 'ok' });
    expect(errs.name).toMatch(/required/);
  });

  it('flags overlong name', () => {
    const errs = validateManifestDraft({ name: 'x'.repeat(121), slug: 'ok', description: 'ok' });
    expect(errs.name).toMatch(/too long/);
  });

  it('flags bad slug — uppercase', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: 'My-Skill', description: 'ok' });
    expect(errs.slug).toMatch(/lowercase/);
  });

  it('flags bad slug — leading dash', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: '-bad', description: 'ok' });
    expect(errs.slug).toMatch(/lowercase/);
  });

  it('flags bad slug — trailing dash', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: 'bad-', description: 'ok' });
    expect(errs.slug).toMatch(/lowercase/);
  });

  it('accepts single-char-bounded slugs', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: 'a-b', description: 'ok' });
    expect(errs.slug).toBeUndefined();
  });

  it('flags missing description', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: 'ok', description: '' });
    expect(errs.description).toMatch(/required/);
  });

  it('flags overlong description', () => {
    const errs = validateManifestDraft({ name: 'ok', slug: 'ok', description: 'x'.repeat(2001) });
    expect(errs.description).toMatch(/too long/);
  });
});
