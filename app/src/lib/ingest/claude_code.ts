// Claude Code session transcript → InteractionTrace / SkillManifest.
//
// Claude Code writes one JSONL record per event to
// `~/.claude/projects/<slug>/<sessionId>.jsonl`. Every `tool_use` block and
// its matching `tool_result` is already the observable agent step that
// `TraceEdge` describes — so a session is a trace we never had to instrument
// anything to collect.
//
// This module is PURE: no `fs`, no DOM, no network. It takes already-parsed
// records and returns plain data, so the same code runs in the vitest suite,
// in the `tools/ingest-transcript.ts` CLI, and (later) in the browser. The
// only file allowed to read a real transcript off disk is the CLI, because
// transcripts contain whatever the user was actually working on.
//
// Segmentation: one `user_message` and the tool loop that follows it is one
// candidate skill. A single session runs to 210 MB and a full day of
// unrelated work; a whole-session bundle would be neither replayable nor
// reusable. `ia/phase_check.ts` already segments cycles at exactly this
// boundary, so the two agree by construction.

import { v5 as uuidv5 } from 'uuid';
import { stateHash, type InteractionTrace, type TraceEdge } from '../trace';
import type { Capability, SkillManifest } from '../types';

/** Fixed namespace so re-ingesting the same segment yields the same ids. */
export const INGEST_NAMESPACE = '6f0b4e8a-2c1d-4f7a-9e3b-5d8c1a2b3c4d';

// -------------------------------------------------------------- record shapes

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  /** tool_use */
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  /** tool_result */
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export interface TranscriptRecord {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  /** Structured result payload, present on `user` records carrying a tool_result. */
  toolUseResult?: unknown;
  message?: { role?: string; model?: string; content?: unknown };
}

/** Parse one JSONL line. Returns null for blank or malformed lines. */
export function parseLine(line: string): TranscriptRecord | null {
  const s = line.trim();
  if (!s) return null;
  try {
    const d = JSON.parse(s);
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return null;
    return d as TranscriptRecord;
  } catch {
    return null;
  }
}

function blocksOf(rec: TranscriptRecord): ContentBlock[] {
  const c = rec.message?.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  if (Array.isArray(c)) return c.filter((b): b is ContentBlock => !!b && typeof b === 'object');
  return [];
}

/** A user record is a *prompt* when it carries no tool_result blocks. */
function isUserPrompt(rec: TranscriptRecord): boolean {
  if (rec.type !== 'user') return false;
  return !blocksOf(rec).some((b) => b.type === 'tool_result');
}

// ------------------------------------------------------------- capability map

// The manifest schema constrains a capability to `^(&[a-z]+\.[a-z_]+|ambient)$`
// — exactly two dot-separated segments, lowercase, underscores allowed in the
// second. Every value below is checked against that pattern by the test suite,
// because a typo here would silently produce an unschemable manifest.
export const CAPABILITY_PATTERN = /^(&[a-z]+\.[a-z_]+|ambient)$/;

export const TOOL_CAPABILITY_MAP: Record<string, Capability> = {
  Bash: '&host.shell',
  BashOutput: '&host.shell',
  KillShell: '&host.shell',
  Read: '&host.fs_read',
  Grep: '&host.fs_read',
  Glob: '&host.fs_read',
  NotebookRead: '&host.fs_read',
  Edit: '&host.fs_write',
  Write: '&host.fs_write',
  NotebookEdit: '&host.fs_write',
  WebFetch: '&net.http',
  WebSearch: '&net.http',
  Task: '&agent.spawn',
  Agent: '&agent.spawn',
  // Bookkeeping that touches nothing outside the conversation.
  TodoWrite: 'ambient',
  ToolSearch: 'ambient',
  Skill: 'ambient',
  TaskCreate: 'ambient',
  TaskUpdate: 'ambient',
  TaskList: 'ambient',
  TaskGet: 'ambient',
  TaskOutput: 'ambient',
  TaskStop: 'ambient',
  ExitPlanMode: 'ambient',
  EnterPlanMode: 'ambient'
};

/** Lowercase, collapse anything outside [a-z_] to a single underscore. */
function sanitizeSegment(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return out || 'unknown';
}

/**
 * Map a Claude Code tool name onto an [&] capability.
 *
 * An unrecognized tool becomes `&host.unknown_<name>` and NEVER `ambient`.
 * Defaulting an unknown tool to "needs no authority" would make a capability
 * the verifier has never heard of indistinguishable from one known to be
 * harmless — and gate.no_hidden_capability exists precisely to catch that.
 */
export function toolToCapability(toolName: string): Capability {
  if (toolName.startsWith('mcp__')) {
    const server = toolName.split('__')[1] ?? '';
    return `&mcp.${sanitizeSegment(server)}` as Capability;
  }
  const known = TOOL_CAPABILITY_MAP[toolName];
  if (known) return known;
  return `&host.unknown_${sanitizeSegment(toolName)}` as Capability;
}

/** Split `mcp__<server>__<tool>` into its parts; builtins report `claude-code`. */
export function splitToolName(toolName: string): { server: string; name: string } {
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return { server: parts[1] ?? 'unknown', name: parts.slice(2).join('__') || toolName };
  }
  return { server: 'claude-code', name: toolName };
}

// ------------------------------------------------------------- segmentation

export interface Segment {
  /** 0-based position within the session. */
  index: number;
  session_id: string;
  started_at: string;
  /** The user turn that opened this segment. */
  prompt: string;
  /** Empty when this segment was indexed but not retained — see `retainSegment`. */
  records: TranscriptRecord[];
  /** Always counted, retained or not. */
  record_count: number;
  tool_calls: number;
  capabilities_seen: Capability[];
  model?: string;
  cwd?: string;
  git_branch?: string;
}

export interface IngestReport {
  session_id: string;
  segments: Segment[];
  /**
   * Counts of everything NOT turned into an edge. Reported, never silent:
   * a zero and a blank look identical in a table and mean opposite things.
   */
  excluded: {
    unparsable_lines: number;
    non_message_records: number;
    sidechain_records: number;
    thinking_blocks: number;
    /** Records seen before the first user prompt (session resumes, hooks). */
    preamble_records: number;
  };
  records_total: number;
}

export interface IngesterOptions {
  /**
   * Which segment's records to keep in memory. `'all'` (the default) is fine
   * for a fixture; a single index is what you want against a real transcript,
   * where the largest session on disk is 210 MB. Pass `'none'` to index a
   * session — prompts, counts, capabilities — without retaining any records.
   */
  retainSegment?: number | 'all' | 'none';
}

/**
 * Streaming, line-at-a-time transcript ingester.
 *
 * Stateful rather than a plain loop so the same code serves a synchronous
 * array (tests) and an async line stream (the CLI reading a 210 MB file)
 * without either path duplicating the record semantics.
 */
export class Ingester {
  readonly report: IngestReport = {
    session_id: '',
    segments: [],
    excluded: {
      unparsable_lines: 0,
      non_message_records: 0,
      sidechain_records: 0,
      thinking_blocks: 0,
      preamble_records: 0
    },
    records_total: 0
  };

  private current: Segment | null = null;
  private currentCaps: Set<string> = new Set();
  private readonly retain: number | 'all' | 'none';

  constructor(options: IngesterOptions = {}) {
    this.retain = options.retainSegment ?? 'all';
  }

  private shouldRetain(segmentIndex: number): boolean {
    if (this.retain === 'all') return true;
    if (this.retain === 'none') return false;
    return this.retain === segmentIndex;
  }

  push(line: string): void {
    const rec = parseLine(line);
    if (!rec) {
      if (line.trim()) this.report.excluded.unparsable_lines++;
      return;
    }
    this.report.records_total++;
    if (!this.report.session_id && rec.sessionId) this.report.session_id = rec.sessionId;

    if ((rec.type !== 'user' && rec.type !== 'assistant') || !rec.message) {
      this.report.excluded.non_message_records++;
      return;
    }
    // Subagent turns belong to their own trace, not this one.
    if (rec.isSidechain) {
      this.report.excluded.sidechain_records++;
      return;
    }

    if (isUserPrompt(rec)) {
      const index = this.report.segments.length;
      this.current = {
        index,
        session_id: rec.sessionId ?? this.report.session_id,
        started_at: rec.timestamp ?? '',
        prompt: blocksOf(rec)
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n')
          .trim(),
        records: this.shouldRetain(index) ? [rec] : [],
        record_count: 1,
        tool_calls: 0,
        capabilities_seen: [],
        cwd: rec.cwd,
        git_branch: rec.gitBranch
      };
      this.currentCaps = new Set();
      this.report.segments.push(this.current);
      return;
    }

    if (!this.current) {
      this.report.excluded.preamble_records++;
      return;
    }
    if (rec.type === 'assistant' && rec.message.model && !this.current.model) {
      this.current.model = rec.message.model;
    }

    this.current.record_count++;
    if (this.shouldRetain(this.current.index)) this.current.records.push(rec);

    // Counted whether or not the record is retained, so an index pass over a
    // 210 MB session still reports what each segment did.
    for (const b of blocksOf(rec)) {
      if (b.type === 'thinking') this.report.excluded.thinking_blocks++;
      else if (b.type === 'tool_use' && b.name) {
        this.current.tool_calls++;
        this.currentCaps.add(toolToCapability(b.name));
      }
    }
    this.current.capabilities_seen = [...this.currentCaps].sort() as Capability[];
  }

  finish(): IngestReport {
    return this.report;
  }
}

export function ingestRecords(lines: Iterable<string>, options?: IngesterOptions): IngestReport {
  const ing = new Ingester(options);
  for (const line of lines) ing.push(line);
  return ing.finish();
}

export async function ingestRecordsAsync(
  lines: AsyncIterable<string>,
  options?: IngesterOptions
): Promise<IngestReport> {
  const ing = new Ingester(options);
  for await (const line of lines) ing.push(line);
  return ing.finish();
}

// -------------------------------------------------------------------- trace

/** Deterministic uuid for a segment's trace (the manifest schema wants uuids). */
export function segmentTraceId(segment: Segment): string {
  return uuidv5(`trace:${segment.session_id}:${segment.index}`, INGEST_NAMESPACE);
}

export function segmentSkillId(segment: Segment): string {
  return uuidv5(`skill:${segment.session_id}:${segment.index}`, INGEST_NAMESPACE);
}

/**
 * Project a segment onto an InteractionTrace.
 *
 * `thinking` blocks are dropped: they are not observable in the world and
 * they carry the model's unedited reasoning about whatever the user was
 * working on. `ingestRecords` counts them so the omission stays visible.
 *
 * The record's own `timestamp` becomes the edge `ts` — an ingested trace must
 * describe when the work happened, not when it was ingested.
 */
export async function segmentToTrace(segment: Segment): Promise<InteractionTrace> {
  const edges: TraceEdge[] = [];

  // Optional fields are omitted rather than set to undefined. An edge is
  // hashed and re-hashed on every verify; a key that only ever holds
  // `undefined` is noise in a 210 MB transcript.
  const push = async (
    e: Omit<TraceEdge, 'index' | 'state_hash'> & { observation?: unknown }
  ): Promise<void> => {
    const edge: TraceEdge = { index: edges.length, ts: e.ts, kind: e.kind };
    if (e.capability !== undefined) edge.capability = e.capability;
    if (e.tool_call !== undefined) edge.tool_call = e.tool_call;
    if (e.observation !== undefined) {
      edge.observation = e.observation;
      edge.state_hash = await stateHash(e.observation);
    }
    edges.push(edge);
  };

  for (const rec of segment.records) {
    const ts = rec.timestamp ?? segment.started_at;
    for (const b of blocksOf(rec)) {
      if (b.type === 'thinking') continue;

      if (rec.type === 'user') {
        if (b.type === 'tool_result') {
          // Prefer the structured `toolUseResult`; fall back to the block's
          // own content when the tool errored and produced no structure.
          const observation = rec.toolUseResult !== undefined ? rec.toolUseResult : (b.content ?? null);
          await push({ ts, kind: 'observe', observation });
        } else if (b.type === 'text' && (b.text ?? '').trim()) {
          await push({ ts, kind: 'user_message', observation: { content: b.text } });
        }
        continue;
      }

      // assistant
      if (b.type === 'text' && (b.text ?? '').trim()) {
        await push({ ts, kind: 'assistant_message', observation: { content: b.text } });
      } else if (b.type === 'tool_use' && b.name) {
        const { server, name } = splitToolName(b.name);
        await push({
          ts,
          kind: b.name.startsWith('mcp__') ? 'mcp_call' : 'act',
          capability: toolToCapability(b.name),
          tool_call: { server, name, arguments: b.input ?? {} }
        });
      }
    }
  }

  return {
    trace_id: segmentTraceId(segment),
    started_at: segment.started_at || (edges[0]?.ts ?? ''),
    edges
  };
}

/** Every capability the trace actually exercised, sorted and deduped. */
export function observedCapabilities(trace: InteractionTrace): Capability[] {
  const set = new Set<string>();
  for (const e of trace.edges) if (e.capability) set.add(e.capability);
  return [...set].sort() as Capability[];
}

// ----------------------------------------------------------------- manifest

function toSlug(text: string, fallback: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s.length >= 2 ? s : fallback;
}

function firstLine(text: string, max: number): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  const t = line.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export interface DraftManifestOptions {
  /**
   * Override the declared capability set. Omit for the honest manifest
   * (everything the trace exercised); pass a narrower list to test whether
   * gate.no_hidden_capability actually catches an understatement.
   */
  capabilities?: Capability[];
}

export function draftManifest(
  segment: Segment,
  trace: InteractionTrace,
  options: DraftManifestOptions = {}
): SkillManifest {
  const observed = observedCapabilities(trace);
  const capabilities = options.capabilities ?? observed;
  const name = firstLine(segment.prompt, 120) || `session ${segment.session_id.slice(0, 8)} turn ${segment.index}`;
  const now = new Date().toISOString();

  return {
    schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
    skill_id: segmentSkillId(segment),
    name,
    slug: toSlug(name, `turn-${segment.index}`),
    description: firstLine(segment.prompt, 400) || 'ingested Claude Code transcript segment',
    version: 1,
    derived_from_trace_id: trace.trace_id,
    // Claude Code acts on the local machine: shell, filesystem, network.
    body_choice: 'host',
    inputs: [{ name: 'goal', type: 'string', required: true }],
    outputs: [{ name: 'final_message', type: 'string' }],
    preconditions: segment.git_branch ? [`git branch: ${segment.git_branch}`] : [],
    // A transcript records what one specific model version did. Claiming
    // portability would be a claim this data cannot support.
    binding: segment.model ? 'model_version_bound' : 'substrate_only',
    validated_against: segment.model
      ? [{ model: segment.model, fidelity: 1.0, level: 'exact', ts: segment.started_at || now }]
      : undefined,
    capabilities_required: capabilities.length > 0 ? capabilities : ['ambient'],
    created_at: segment.started_at || now,
    updated_at: now
  };
}
