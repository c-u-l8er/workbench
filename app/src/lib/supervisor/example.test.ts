// Worked example must validate against the charter validator
// (Supervisor spec §2.3 / examples/charters/replay_fidelity.charter.json).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCharter } from './charter';

const here = dirname(fileURLToPath(import.meta.url));
const charterPath = join(here, '../../../../examples/charters/replay_fidelity.charter.json');

describe('worked-example charter (spec §2.3)', () => {
  it('parses and validates', () => {
    const text = readFileSync(charterPath, 'utf-8');
    const r = parseCharter(text);
    if (!r.ok) {
      // Surface the actual errors if this ever breaks — easier than guessing.
      throw new Error('charter failed validation: ' + JSON.stringify(r.errors, null, 2));
    }
    expect(r.ok).toBe(true);
    expect(r.charter?.invariant_ref.invariant_id).toBe('replay_determinism');
    // Cartesian product size in spec §2.3 is 2 × 3 × 3 × 2 = 36.
    const product = r.charter!.manifestation_space.reduce(
      (acc, d) => acc * d.values.length,
      1
    );
    expect(product).toBe(36);
  });
});
