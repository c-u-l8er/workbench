# Ingest spike — Claude Code transcripts → SkillBundles

**Date:** 2026-08-11 · **Status:** run, answered · **Code:** `app/src/lib/ingest/`,
`app/tools/ingest-transcript.ts`

## What was tested

Whether a real Claude Code session transcript (`~/.claude/projects/<slug>/<id>.jsonl`) can be
turned into a real, scored SkillBundle using the verifier that already exists — with no new
chat UI, no OpenRouter key, and no changes to the six gates.

Reproduce:

```bash
cd workbench/app && npm test
```

```bash
cd workbench/app && ./node_modules/.bin/vite-node tools/ingest-transcript.ts ~/.claude/projects/<slug>/<id>.jsonl
```

## The four questions

### 1. Does the mapping hold? — **Yes, with no new edge kinds.**

Claude Code records project onto the existing `TraceEdgeKind` union without extension:

| Transcript | TraceEdge |
|---|---|
| `user` record, string content | `user_message` |
| `assistant` `text` block | `assistant_message` |
| `assistant` `tool_use`, builtin | `act` + `capability` + `tool_call` |
| `assistant` `tool_use`, `mcp__*` | `mcp_call` + `capability` + `tool_call` |
| `user` `tool_result` (+ `toolUseResult`) | `observe` + `observation` + `state_hash` |
| `assistant` `thinking` block | dropped, **counted** |
| `isSidechain` record | dropped, **counted** |

The derived manifest validates against `SKILL_MANIFEST.v0.schema.json` unmodified. Edge `ts`
comes from the transcript, not from ingestion time.

One constraint the schema forced: `capabilities_required` items must match
`^(&[a-z]+\.[a-z_]+|ambient)$` — two segments, lowercase. So `&host.fs_read`, not
`&host.fs.read`. And `skill_id` / `derived_from_trace_id` are `format: uuid`, so ids are
UUIDv5-derived from `(sessionId, segmentIndex)` — deterministic, so re-ingesting a segment
yields the same ids.

### 2. Do the gates carry signal? — **Yes. Measured, not assumed.**

Each segment is sealed twice: once with every observed capability declared, once with the
most-used capability deliberately dropped.

```
  honest manifest — every observed capability declared
  PASS   gate.content_hash            L14/topological
  PASS   gate.trace_completeness      L11/L14/spatial
  PASS   gate.no_hidden_capability    L11/L14/spatial
  PASS   gate.authority               L14/governance
  PASS   gate.redaction_verify        L12/L14/topological
  PASS   gate.replay_fidelity         L12/L14/topological
  → overall PASS

  understated manifest — "&host.fs_read" deliberately not declared
  FAIL   gate.no_hidden_capability    undeclared: &host.fs_read
  FAIL   gate.authority               undeclared capability invokes implicit grant: &host.fs_read
  → overall FAIL
```

The understated run fails on every real session tried. The gate is not decoration.

### 3. Does the format survive real scale? — **Yes, given streaming + segmentation.**

Largest session on disk: **202 MB / 10,040 records / 75 segments.**

| | |
|---|---|
| Index pass (streaming, no records retained) | **936 ms** |
| Build the largest segment (304 records → 270 edges) | **1,031 ms** |
| Resulting bundle | **21.1 MB** |

Two passes, deliberately: pass 1 indexes prompts / tool counts / capabilities without retaining
records, pass 2 retains exactly one segment. An ingester that must hold the file to answer
"what is in here?" would not survive this corpus.

**Segmentation is load-bearing.** A whole-session bundle would be a full day of unrelated work.
Per-user-turn segmentation yields 75 candidate skills from that session, the largest of which is
21 MB.

**Finding: `deriveEvidence` doubles every bundle.** Measured on a 1.57 MB bundle — trace 0.79 MB,
evidence 0.79 MB, the *same* trace re-embedded. Exactly 50% of every bundle is duplication.
`builder.ts` calls this "re-projects rather than duplicating storage", which is true of the
in-memory intent but not of the serialized artifact. Worth revisiting before bundles are stored
in bulk.

### 4. Does the phase model survive real tool loops? — **No. Fixed 2026-08-11.**

> **Resolved.** `checkPhaseOrder` now closes a cycle when feedback arrives and the next step is
> not after it. The 22 MB session below went from **94 violations / 1 cycle** to **0 violations /
> 95 cycles**. Only a phase at or past `learn` opens a new cycle, so `act → route`
> (authorize-after-act) is still reported and is pinned by a test. The original finding is kept
> below because it is why the change was made.


`ia/phase_check.ts` maps `act → act` and `observe → learn`. A normal Claude Code tool loop is
`act, observe, act, observe, …`, so every second transition is a backward `learn → act`:

| Session | edges | violations | all of kind |
|---|---|---|---|
| 4.5 MB, segment 0 | 63 | 25 | `learn → act` |
| 202 MB, segment 37 | 270 | 124 | `learn → act` |
| 22 MB, segment 27 | 209 | 94 | `learn → act` |

Every violation on every real segment is the same transition. The count is exactly the number
of tool calls.

This is not a trace defect — it is the phase model applied at the wrong granularity.
`checkPhaseOrder` segments cycles at `user_message`, which means one user turn with 124 tool
calls is treated as a single cycle that must be phase-monotone. **A tool call is its own
micro-cycle**: retrieve the state, act, observe the result. Either `checkPhaseOrder` should
segment at `observe → act` boundaries as well, or `edgeToPhase` should not map `observe` to
`learn`.

Until that is decided, this warning must not be surfaced in a UI — it would fire on every
ingested trace and mean nothing. The test suite pins the current behaviour so a change is
noticed rather than absorbed.

## Defects found and fixed

The spike found three bugs in shipped code. All predate it; the transcripts just exercised
paths the fixtures never did.

### A. `canonicalize` threw on any object with an undefined-valued key

`appendEdge(trace, { kind: 'act' })` — a legal edge with no observation — produces
`{ state_hash: undefined }`, and `bundleContentHash` then threw `Unsupported value type:
undefined`. Any teach flow appending an edge without an observation would have crashed at
crystallize time.

Fixed in `lib/hash.ts` by omitting undefined-valued keys, matching `JSON.stringify`. This
cannot change any existing hash: such inputs used to throw, so no bundle's hash depended on
them.

### B. `transcript_pii` redaction never walked `tool_call.arguments` — a live secret leak

`redactEdges` walked `observation` only. A secret handed to a *tool* — `export TOKEN=…` in a
Bash command, a key written into a config file, a bearer token in a fetched URL — survived
redaction completely.

This is not theoretical. Scanning this project's transcripts for key-shaped strings:

```
  f88583bb    3 hits  (202M)      aa0e23f6   40 hits  (31M)
  8a486fc0    1 hits  (96M)       060546cb    5 hits  (31M)
  1c2d0f5e    3 hits  (90M)       43945ded  260 hits  (22M)
  5a3360dc    9 hits  (75M)       75b61ded   65 hits  (21M)
```

One ingested segment carried **86 key-shaped strings, 4 of them in tool arguments**. After the
fix: 0 remaining.

Also fixed: the `full` profile — the one described as "for publishing a bundle for third-party
inspection" — kept `tool_call.arguments` verbatim. It now drops them, keeping `server` + `name`
so the replay skeleton survives.

### C. `applyProfile` never redacted the manifest

`name`, `description` and `slug` were untouched by every profile. In the teach flow the author
typed them; in the ingest flow they are derived from the user's prompt — which is precisely
where a pasted key lands. A `full`-profile bundle still shipped the secret in `manifest.name`.

Fixed in `lib/redact.ts`. The slug is re-derived after redaction, because `[REDACTED_API_KEY]`
does not satisfy the slug pattern *and* a lowercase-hyphenated secret slugifies unscathed.
`isIdempotent` now compares the manifest too, so `gate.redaction_verify` covers everything
`applyProfile` touches.

## Kill criteria — none tripped

- Understated manifests fail the gate on every real session. Signal confirmed.
- Segment bundles are 0.3–21 MB. Large, but hashable and storable.
- `checkPhaseOrder` flags every segment — this **was** the third kill criterion, and it fired.
  It is recorded as a substrate bug to fix rather than a reason to stop, because the failure is
  uniform, fully explained, and in the checker rather than in the ingested traces.

## Status

150/150 vitest tests pass (132 pre-existing + 18 new). `npm run check` goes 26 → 27 errors; the
one added is the same pre-existing "no declaration file for `uuid`" error that
`trace.ts`, `builder.ts`, `replay.ts` and `charter.ts` already carry. `@types/uuid` would clear
five of them at once.

## What shipped on top of the spike

- **`/record`** (`app/src/routes/record/+page.svelte`) — drop a transcript, see the session
  index and its excluded counts, pick a segment, get six gate verdicts with their law and IA
  family, choose a redaction profile, save to the library. Verified in-browser end to end:
  saved with `transcript_pii` and read straight back out of IndexedDB — 0 raw key occurrences,
  8 redaction markers, manifest name redacted.
- **`app/src/lib/ingest/stream.ts`** — browser line reader over `File.stream()`. `file.text()`
  is not an option at 202 MB.
- **`checkPhaseOrder` cycle boundaries** — see §4 above.

## Not done

No Claude Code hooks integration, no `claude -p` driving, no local-app shell, no changes to the
marketing site or Academy, and the OpenRouter path is untouched. Those depend on this answer,
which is: **the recorder thesis holds.**
