// Phase 1 gate: is every prerendered route actually readable by a crawler?
//
// Run after `npm run build`. Measures the built HTML the way a stdlib crawler
// does — strip script/style/noscript, strip tags, count words — because that is
// exactly what alkeyword's crawl.py does, and its `needs_headless` heuristic
// (word_count < 100 && has_script) is what flagged this whole surface as an SPA
// with 0 claims. See ../docs/ROADMAP.md section 3, Phase 1.
//
//   node tools/check-prerender.mjs
//
// Exits non-zero on the first route that would be dark to an engine.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const MIN_WORDS = 100; // alkeyword's needs_headless threshold

// The SPA fallback is deliberately contentless — it exists only so
// /skills/<id> resolves. Excluded, and named here rather than silently skipped.
const EXEMPT = new Set(['fallback.html']);

function extractableWords(html) {
  const stripped = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = stripped
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function tag(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

const files = readdirSync(BUILD).filter((f) => f.endsWith('.html'));
if (files.length === 0) {
  console.error('no HTML in build/ — run `npm run build` first');
  process.exit(1);
}

const rows = [];
const failures = [];

for (const f of files.sort()) {
  if (EXEMPT.has(f)) {
    rows.push({ f, words: '—', title: '(exempt: SPA fallback)', canonical: '—', ld: '—' });
    continue;
  }
  const html = readFileSync(join(BUILD, f), 'utf8');

  const words = extractableWords(html);
  const title = tag(html, /<title>([^<]*)<\/title>/i);
  const canonical = tag(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];

  let ld = '';
  if (blocks.length !== 1) {
    ld = `${blocks.length} blocks`;
  } else {
    try {
      const d = JSON.parse(blocks[0][1]);
      ld = d['@type'] && d.url && d.name ? d['@type'] : 'incomplete';
    } catch {
      ld = 'invalid JSON';
    }
  }

  const bad = [];
  if (words < MIN_WORDS) bad.push(`${words} words < ${MIN_WORDS}`);
  if (!title) bad.push('no <title>');
  if (!canonical) bad.push('no canonical');
  if (blocks.length !== 1 || ['incomplete', 'invalid JSON'].includes(ld)) bad.push(`ld+json: ${ld}`);
  if (bad.length) failures.push(`${f} — ${bad.join('; ')}`);

  rows.push({ f, words, title, canonical: canonical ? 'yes' : 'NO', ld });
}

const w = (s, n) => String(s).padEnd(n);
console.log(`\n${w('route', 18)}${w('words', 7)}${w('canon', 7)}${w('ld+json', 20)}title`);
console.log('-'.repeat(96));
for (const r of rows) {
  console.log(`${w(r.f, 18)}${w(r.words, 7)}${w(r.canonical, 7)}${w(r.ld, 20)}${r.title.slice(0, 44)}`);
}

console.log(
  `\ngate: every prerendered route needs >=${MIN_WORDS} extractable words, a title, ` +
    'a canonical, and exactly one valid JSON-LD block'
);

if (failures.length) {
  console.log('\nFAILING:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('\nPASS — no route would read as an empty shell.');
