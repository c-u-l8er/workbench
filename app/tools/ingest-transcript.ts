// Spike CLI: run a real Claude Code transcript through the Workbench verifier.
//
//   ./node_modules/.bin/vite-node tools/ingest-transcript.ts <session.jsonl> [--segment N] [--out FILE]
//
// This is the ONLY file permitted to read a transcript off disk. Transcripts
// contain whatever the user was actually working on, so nothing here writes
// anything unless an explicit --out path is given, and no transcript is ever
// copied into the repo.
//
// Two passes on purpose. Pass 1 streams the file and indexes it without
// retaining any records; pass 2 streams it again and retains exactly one
// segment. The largest session on this machine is 210 MB — an ingester that
// must hold the whole file to answer "what is in here?" would not survive
// contact with real data, and the point of the spike is to find that out
// before building a UI on top of it.

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  Ingester,
  draftManifest,
  observedCapabilities,
  segmentToTrace,
  type IngestReport,
  type Segment
} from '../src/lib/ingest/claude_code';
import { sealBundle } from '../src/lib/ingest/seal';
import { checkPhaseOrder } from '../src/lib/ia/phase_check';
import { applyProfile, isIdempotent } from '../src/lib/redact';
import type { Capability, ProofGate } from '../src/lib/types';

// ------------------------------------------------------------------ helpers

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function stream(path: string, options: ConstructorParameters<typeof Ingester>[0]) {
  const ing = new Ingester(options);
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  for await (const line of rl) ing.push(line);
  return ing.finish();
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function truncate(s: string, n: number): string {
  const one = s.split('\n').find((l) => l.trim()) ?? '';
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

function gateLine(g: ProofGate): string {
  const mark = g.verdict === 'pass' ? 'PASS' : g.verdict === 'fail' ? 'FAIL' : g.verdict.toUpperCase();
  const id = g.id.padEnd(28);
  const law = `${g.law ?? '—'}/${g.invariant_family ?? '—'}`.padEnd(22);
  return `  ${mark.padEnd(6)} ${id} ${law} ${g.reason ?? ''}`.trimEnd();
}

// --------------------------------------------------------------------- args

const argv = process.argv.slice(2);
const path = argv.find((a) => !a.startsWith('--'));
if (!path) fail('usage: ingest-transcript.ts <session.jsonl> [--segment N] [--out FILE]');

const segArg = argv.indexOf('--segment');
const wanted = segArg >= 0 ? Number(argv[segArg + 1]) : null;
const outArg = argv.indexOf('--out');
const outPath = outArg >= 0 ? argv[outArg + 1] : null;

// ------------------------------------------------------------------- pass 1

const t0 = Date.now();
const index: IngestReport = await stream(path!, { retainSegment: 'none' });
const indexMs = Date.now() - t0;

console.log(`\n── session ${index.session_id || '(unknown)'} ─────────────────────────────`);
console.log(`  file            ${path}`);
console.log(`  records         ${index.records_total}`);
console.log(`  segments        ${index.segments.length}`);
console.log(`  indexed in      ${indexMs} ms (streaming, no records retained)`);
console.log(`\n  excluded (counted, never silent)`);
for (const [k, v] of Object.entries(index.excluded)) {
  console.log(`    ${k.padEnd(22)} ${v}`);
}

if (index.segments.length === 0) fail('no user prompts found — nothing to segment');

const ranked = [...index.segments].sort((a, b) => b.tool_calls - a.tool_calls);
console.log(`\n  top segments by tool calls`);
console.log(`    ${'idx'.padEnd(5)} ${'recs'.padEnd(6)} ${'tools'.padEnd(6)} ${'caps'.padEnd(5)} prompt`);
for (const s of ranked.slice(0, 10)) {
  console.log(
    `    ${String(s.index).padEnd(5)} ${String(s.record_count).padEnd(6)} ` +
      `${String(s.tool_calls).padEnd(6)} ${String(s.capabilities_seen.length).padEnd(5)} ` +
      truncate(s.prompt, 70)
  );
}

// ------------------------------------------------------------------- pass 2

const target = wanted ?? ranked[0].index;
if (!index.segments[target]) fail(`no segment ${target} (session has ${index.segments.length})`);

const t1 = Date.now();
const full = await stream(path!, { retainSegment: target });
const segment: Segment = full.segments[target];
const trace = await segmentToTrace(segment);
const buildMs = Date.now() - t1;

console.log(`\n── segment ${target} ──────────────────────────────────────────`);
console.log(`  prompt          ${truncate(segment.prompt, 90)}`);
console.log(`  model           ${segment.model ?? '(none recorded)'}`);
console.log(`  records         ${segment.record_count}`);
console.log(`  trace edges     ${trace.edges.length}`);
console.log(`  built in        ${buildMs} ms`);

const byKind: Record<string, number> = {};
for (const e of trace.edges) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
console.log(`  edge kinds      ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(' ')}`);

const honest = observedCapabilities(trace);
console.log(`  capabilities    ${honest.join(' ') || '(none)'}`);

const unknown = honest.filter((c) => c.startsWith('&host.unknown_'));
if (unknown.length) console.log(`  UNMAPPED TOOLS  ${unknown.join(' ')}`);

// -- Q2: does gate.no_hidden_capability carry signal? -----------------------

console.log(`\n  honest manifest — every observed capability declared`);
const honestSeal = await sealBundle(draftManifest(segment, trace), trace);
honestSeal.gates.forEach((g) => console.log(gateLine(g)));
console.log(`  → overall ${honestSeal.overall_verdict.toUpperCase()}`);

const bundleBytes = Buffer.byteLength(JSON.stringify(honestSeal.bundle));
console.log(`\n  bundle size     ${bytes(bundleBytes)}`);
console.log(`  content_hash    ${honestSeal.bundle.content_hash}`);

if (honest.length > 0) {
  const dropped = honest.find((c) => c !== 'ambient') ?? honest[0];
  const understated = honest.filter((c) => c !== dropped) as Capability[];
  console.log(`\n  understated manifest — "${dropped}" deliberately not declared`);
  const badSeal = await sealBundle(
    draftManifest(segment, trace, { capabilities: understated }),
    trace
  );
  for (const g of badSeal.gates) {
    if (g.id === 'gate.no_hidden_capability' || g.id === 'gate.authority') console.log(gateLine(g));
  }
  console.log(`  → overall ${badSeal.overall_verdict.toUpperCase()}`);
  if (badSeal.overall_verdict !== 'fail') {
    console.log(`  !! the understated manifest still passed — the gate has no signal here`);
  }
}

// -- Q4: what does the phase model make of a real tool loop? ----------------

const phase = checkPhaseOrder(trace);
console.log(`\n  phase check     cycles=${phase.cycles} violations=${phase.violations.length}`);
if (phase.violations.length) {
  const kinds: Record<string, number> = {};
  for (const v of phase.violations) {
    const k = `${v.from_phase} → ${v.to_phase}`;
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(kinds)) console.log(`    ${k.padEnd(24)} ${v}`);
}

// -- redaction ---------------------------------------------------------------

const cleaned = applyProfile(honestSeal.bundle, 'transcript_pii');
const before = JSON.stringify(honestSeal.bundle);
const after = JSON.stringify(cleaned);
const KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;
const keyHits = (before.match(KEY_RE) ?? []).length;
const keyLeft = (after.match(KEY_RE) ?? []).length;
// How many of those sit in tool arguments rather than observations. Before
// redact.ts learned to walk tool_call, every one of these survived redaction.
const inArgs = honestSeal.bundle.interaction_trace.edges.reduce((n, e) => {
  const tc = (e as { tool_call?: unknown }).tool_call;
  return n + (tc ? (JSON.stringify(tc).match(KEY_RE) ?? []).length : 0);
}, 0);
console.log(`\n  redaction       transcript_pii: ${keyHits} key-shaped string(s) → ${keyLeft} remaining`);
console.log(`                  ${inArgs} of them in tool_call arguments`);
console.log(`  idempotent      transcript_pii=${isIdempotent(honestSeal.bundle, 'transcript_pii')} full=${isIdempotent(honestSeal.bundle, 'full')}`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify(honestSeal.bundle, null, 2));
  console.log(`\n  wrote           ${outPath} (${bytes(bundleBytes)}) — UNREDACTED`);
}

console.log('');
