// Canonical JSON + sha256 helpers for bundle content_hash (spec 5.1, 8.3 #8).
// Canonical JSON: keys sorted lexicographically at every object depth, no whitespace,
// numbers in shortest round-trip form. Crucially, the content_hash field is excluded
// from the hash input (it would otherwise be recursive).

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error('Unsupported value type: ' + typeof value);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute a bundle's content_hash. Removes the existing content_hash and
 * signature fields before canonicalizing so the hash is stable and verifiable.
 */
export async function bundleContentHash<T extends Record<string, unknown>>(bundle: T): Promise<string> {
  const { content_hash, signature, ...rest } = bundle as T & {
    content_hash?: unknown;
    signature?: unknown;
  };
  void content_hash;
  void signature;
  const hex = await sha256Hex(canonicalize(rest));
  return 'sha256:' + hex;
}
