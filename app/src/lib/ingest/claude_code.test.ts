// Ingest spike: does a Claude Code transcript become a real, scored SkillBundle?
//
// Runs against a hand-written synthetic transcript at
// workbench/fixtures/transcripts/sample-session.jsonl. Real transcripts are
// read from ~/.claude by tools/ingest-transcript.ts and are never committed —
// they contain whatever the user was actually working on.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// The spec schemas declare $schema: draft/2020-12, which needs Ajv's 2020 build.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import {
  CAPABILITY_PATTERN,
  TOOL_CAPABILITY_MAP,
  draftManifest,
  ingestRecords,
  observedCapabilities,
  segmentToTrace,
  splitToolName,
  toolToCapability
} from './claude_code';
import { sealBundle } from './seal';
import { applyProfile, isIdempotent } from '../redact';
import { checkPhaseOrder } from '../ia/phase_check';

const FIXTURE = new URL('../../../../fixtures/transcripts/sample-session.jsonl', import.meta.url);
const MANIFEST_SCHEMA = new URL(
  '../../../../docs/spec/SKILL_MANIFEST.v0.schema.json',
  import.meta.url
);

function lines(): string[] {
  return readFileSync(FIXTURE, 'utf8').split('\n');
}

describe('capability mapping', () => {
  it('every mapped capability satisfies the manifest schema pattern', () => {
    for (const [tool, cap] of Object.entries(TOOL_CAPABILITY_MAP)) {
      expect(CAPABILITY_PATTERN.test(cap), `${tool} -> ${cap}`).toBe(true);
    }
  });

  it('maps builtin tools to host capabilities', () => {
    expect(toolToCapability('Bash')).toBe('&host.shell');
    expect(toolToCapability('Read')).toBe('&host.fs_read');
    expect(toolToCapability('Edit')).toBe('&host.fs_write');
    expect(toolToCapability('WebFetch')).toBe('&net.http');
    expect(toolToCapability('TodoWrite')).toBe('ambient');
  });

  it('maps mcp tools to their server', () => {
    expect(toolToCapability('mcp__graphonomous__act')).toBe('&mcp.graphonomous');
    expect(splitToolName('mcp__graphonomous__act')).toEqual({
      server: 'graphonomous',
      name: 'act'
    });
    expect(splitToolName('Bash')).toEqual({ server: 'claude-code', name: 'Bash' });
  });

  it('sanitizes mcp server names that the schema pattern would reject', () => {
    const cap = toolToCapability('mcp__7fbc581a-1e5c__do_thing');
    expect(CAPABILITY_PATTERN.test(cap)).toBe(true);
  });

  it('never lets an unknown tool default to ambient', () => {
    const cap = toolToCapability('FrobnicateWidget');
    expect(cap).toBe('&host.unknown_frobnicatewidget');
    expect(cap).not.toBe('ambient');
    expect(CAPABILITY_PATTERN.test(cap)).toBe(true);
  });
});

describe('segmentation', () => {
  it('splits the session at user prompts and counts what it excluded', () => {
    const report = ingestRecords(lines());

    expect(report.session_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(report.segments).toHaveLength(2);
    expect(report.segments[0].prompt).toBe('Count the TODO markers in the repo');
    expect(report.segments[0].model).toBe('claude-opus-5');
    expect(report.segments[0].git_branch).toBe('main');

    // Nothing is dropped silently.
    expect(report.excluded.thinking_blocks).toBe(2);
    expect(report.excluded.sidechain_records).toBe(1);
    expect(report.excluded.non_message_records).toBe(2); // system + queue-operation
    expect(report.excluded.unparsable_lines).toBe(0);
  });
});

describe('segmentToTrace', () => {
  it('produces contiguous edges that preserve the original timestamps', async () => {
    const report = ingestRecords(lines());
    const trace = await segmentToTrace(report.segments[0]);

    trace.edges.forEach((e, i) => expect(e.index).toBe(i));
    expect(trace.edges[0]).toMatchObject({
      kind: 'user_message',
      ts: '2026-08-11T10:00:01.000Z'
    });
    // ts comes from the transcript, not from ingestion time.
    expect(trace.edges.every((e) => e.ts.startsWith('2026-08-11T10:00:'))).toBe(true);
    // Thinking blocks never become edges.
    expect(trace.edges.some((e) => JSON.stringify(e).includes('sig-abc'))).toBe(false);
  });

  it('records tool calls as act/mcp_call with the mapped capability', async () => {
    const report = ingestRecords(lines());
    const t0 = await segmentToTrace(report.segments[0]);
    const t1 = await segmentToTrace(report.segments[1]);

    const bash = t0.edges.find((e) => e.tool_call?.name === 'Bash');
    expect(bash).toMatchObject({ kind: 'act', capability: '&host.shell' });

    const mcp = t1.edges.find((e) => e.tool_call?.server === 'graphonomous');
    expect(mcp).toMatchObject({ kind: 'mcp_call', capability: '&mcp.graphonomous' });

    // Every observe edge carries a state_hash so replay has something to check.
    for (const e of t0.edges.filter((x) => x.kind === 'observe')) {
      expect(e.state_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('observes exactly the capabilities the segment used', async () => {
    const report = ingestRecords(lines());
    const t0 = await segmentToTrace(report.segments[0]);
    expect(observedCapabilities(t0)).toEqual(['&host.fs_read', '&host.shell']);
  });
});

describe('manifest', () => {
  it('validates against SKILL_MANIFEST.v0.schema.json', async () => {
    const report = ingestRecords(lines());
    const trace = await segmentToTrace(report.segments[0]);
    const manifest = draftManifest(report.segments[0], trace);

    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(MANIFEST_SCHEMA, 'utf8')));

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
  });

  it('binds to the model version the transcript actually recorded', async () => {
    const report = ingestRecords(lines());
    const trace = await segmentToTrace(report.segments[0]);
    const manifest = draftManifest(report.segments[0], trace);
    expect(manifest.binding).toBe('model_version_bound');
    expect(manifest.validated_against?.[0].model).toBe('claude-opus-5');
  });
});

describe('the six gates on an ingested trace', () => {
  it('an honest manifest passes all six', async () => {
    const report = ingestRecords(lines());
    const segment = report.segments[0];
    const trace = await segmentToTrace(segment);
    const manifest = draftManifest(segment, trace);

    const { overall_verdict, gates, bundle } = await sealBundle(manifest, trace);

    expect(gates).toHaveLength(6);
    expect(
      gates.filter((g) => g.verdict !== 'pass').map((g) => `${g.id}: ${g.reason}`)
    ).toEqual([]);
    expect(overall_verdict).toBe('pass');
    // The re-sealed hash still verifies.
    expect(bundle.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('understating one capability fails no_hidden_capability AND authority', async () => {
    const report = ingestRecords(lines());
    const segment = report.segments[0];
    const trace = await segmentToTrace(segment);
    const honest = observedCapabilities(trace);
    const understated = honest.filter((c) => c !== '&host.shell');

    const manifest = draftManifest(segment, trace, { capabilities: understated });
    const { overall_verdict, gates } = await sealBundle(manifest, trace);

    const hidden = gates.find((g) => g.id === 'gate.no_hidden_capability');
    const authority = gates.find((g) => g.id === 'gate.authority');

    expect(hidden?.verdict).toBe('fail');
    expect(hidden?.reason).toContain('&host.shell');
    expect(authority?.verdict).toBe('fail');
    expect(authority?.reason).toContain('&host.shell');
    expect(overall_verdict).toBe('fail');
  });
});

describe('redaction', () => {
  it('transcript_pii strips a secret that reached the trace', async () => {
    const report = ingestRecords(lines());
    const segment = report.segments[1];
    const trace = await segmentToTrace(segment);
    const manifest = draftManifest(segment, trace);
    const { bundle } = await sealBundle(manifest, trace);

    const raw = JSON.stringify(bundle.interaction_trace);
    expect(raw).toContain('sk-or-v1-abcdefghij0123456789abcdef');

    const cleaned = JSON.stringify(applyProfile(bundle, 'transcript_pii').interaction_trace);
    expect(cleaned).not.toContain('sk-or-v1-abcdefghij0123456789abcdef');
    expect(cleaned).toContain('[REDACTED_API_KEY]');
  });

  it('strips a secret passed as a tool argument, not just one in an observation', async () => {
    // Regression: redactEdges used to walk `observation` only, so a key handed
    // to a tool survived redaction. On ingested transcripts the arguments are
    // the likeliest place for a real secret.
    const report = ingestRecords(lines());
    const segment = report.segments[1];
    const trace = await segmentToTrace(segment);
    const { bundle } = await sealBundle(draftManifest(segment, trace), trace);

    const argEdge = bundle.interaction_trace.edges.find(
      (e) => (e as { tool_call?: { name: string } }).tool_call?.name === 'FrobnicateWidget'
    );
    expect(JSON.stringify(argEdge)).toContain('sk-or-v1-abcdefghij0123456789abcdef');

    const cleaned = applyProfile(bundle, 'transcript_pii');
    const cleanedArgEdge = cleaned.interaction_trace.edges.find(
      (e) => (e as { tool_call?: { name: string } }).tool_call?.name === 'FrobnicateWidget'
    );
    expect(JSON.stringify(cleanedArgEdge)).not.toContain('sk-or-v1');
    expect(JSON.stringify(cleanedArgEdge)).toContain('[REDACTED_API_KEY]');
  });

  it('the full profile drops tool arguments entirely', async () => {
    const report = ingestRecords(lines());
    const segment = report.segments[1];
    const trace = await segmentToTrace(segment);
    const { bundle } = await sealBundle(draftManifest(segment, trace), trace);

    const full = applyProfile(bundle, 'full');
    const serialized = JSON.stringify(full);
    expect(serialized).not.toContain('sk-or-v1');
    // The skeleton replay needs is still there.
    expect(serialized).toContain('FrobnicateWidget');
  });

  it('both profiles stay idempotent after the tool_call change', async () => {
    const report = ingestRecords(lines());
    const segment = report.segments[1];
    const trace = await segmentToTrace(segment);
    const { bundle } = await sealBundle(draftManifest(segment, trace), trace);

    expect(isIdempotent(bundle, 'transcript_pii')).toBe(true);
    expect(isIdempotent(bundle, 'full')).toBe(true);
  });
});

describe('phase order', () => {
  it('an ingested tool loop is clean once cycles close at feedback', async () => {
    // The spike originally recorded the opposite here: every tool call read as
    // a learn → act violation. That was the checker's segmentation, not the
    // trace. checkPhaseOrder now closes a cycle when feedback arrives, so a
    // faithfully ingested transcript has no violations to report.
    const report = ingestRecords(lines());
    const trace = await segmentToTrace(report.segments[0]);
    const result = checkPhaseOrder(trace);

    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.cycles).toBeGreaterThan(1);
  });
});
