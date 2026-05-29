import { describe, it, expect } from 'vitest';
import { canonicalize, sha256Hex, bundleContentHash } from './hash';

describe('canonicalize', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ z: { d: 4, a: 1 }, a: [3, 2, 1] })).toBe('{"a":[3,2,1],"z":{"a":1,"d":4}}');
  });

  it('emits null/booleans/numbers/strings stably', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('a')).toBe('"a"');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize(Number.NaN)).toThrow();
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('does not preserve insertion order — different input orders produce identical output', () => {
    expect(canonicalize({ a: 1, b: 2, c: 3 })).toBe(canonicalize({ c: 3, b: 2, a: 1 }));
  });
});

describe('sha256Hex', () => {
  it('matches the NIST vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches the NIST vector for the empty string', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('bundleContentHash', () => {
  it('excludes content_hash and signature from the input', async () => {
    const a = { skill_id: 's1', content_hash: 'sha256:aaaa', signature: 'sig1', x: 1 };
    const b = { skill_id: 's1', content_hash: 'sha256:bbbb', signature: 'sig2', x: 1 };
    expect(await bundleContentHash(a)).toBe(await bundleContentHash(b));
  });
  it('changes when any other field changes', async () => {
    const a = await bundleContentHash({ skill_id: 's1', x: 1 });
    const b = await bundleContentHash({ skill_id: 's1', x: 2 });
    expect(a).not.toBe(b);
  });
  it('returns sha256:<64-hex>', async () => {
    const h = await bundleContentHash({ skill_id: 's1', x: 1 });
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
