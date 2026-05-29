# Workbench — Crystallize agent behavior into replayable skills

**A skill workshop and proof harness for the [&] Stack.**

**Spec version:** v0.1 draft
**Status:** spec (not yet `in_tree` per STACK_PLANNING §1.1 / Finding 2 status vocabulary)
**Spec date:** 2026-05-25
**Maintained by:** Travis Burandt
**Update policy:** Update when (a) a section's normative requirements change, (b) a deferred item is promoted into v0.x, (c) a new substrate dependency lands, or (d) the architectural invariant in §15 changes.

**Companion docs:**
- `STACK_COMPLETION.md` — current state of every product/version/deployment
- `STACK_PLANNING.md` — forward-looking protocol/extraction backlog
- `STACK_ARCHITECTURE_GAP_REVIEW.md` — the audit that motivated this workbench (Findings 8, 12; Phase 0)
- `AmpersandBoxDesign/SPEC.md` — authoritative [&] Protocol spec
- `opensentience.org/docs/spec/README.md` — OS-001..OS-011 index
- `PRISM/docs/spec/README.md` — OS-009 PRISM eval engine
- `PULSE/schemas/pulse-loop-manifest.v0.1.json` — PULSE manifest schema (v0.1.1)

---

## 0. Purpose & non-goals

### 0.1 Purpose

The Workbench is the **first end-user surface for the [&] dark-factory loop**. It lets a single user — bringing only an OpenRouter API key — teach an agent a multi-step task by demonstration, crystallize that demonstration into a portable skill, and replay the skill against new inputs with verifiable fidelity.

It is shaped like the runefort.com and bendscript.com playgrounds: a thin web surface that authors a portable artifact in the protocol the surrounding stack defines. The artifact here is a **Skill Bundle** (§7).

### 0.2 The job-to-be-done

> *I keep doing this same boring multi-step task. Show the agent once, get a replayable skill back, and never type it again.*

A user is hiring the Workbench to:

1. Demonstrate a task once, through a body (browser or host).
2. Receive a portable, inspectable skill artifact they can keep, replay, share, or sell.
3. Trust that replays preserve the original behavior (or fail loudly when they don't).

### 0.3 Why now (architectural)

This workbench is the single most leveraged artifact identified by `STACK_ARCHITECTURE_GAP_REVIEW.md`:

- **Finding 8** — PRISM needs portable evidence bundles before more leaderboard surface. Skill Bundles are PRISM Evidence Bundles in disguise.
- **Finding 12** — External validation should move earlier. A BYO-key public surface is external validation.
- **Phase 0 exit criterion** — "A clean machine can run one command and produce a trace, replay, benchmark result, and evidence bundle." The Workbench is the human-facing form of that exit criterion.
- **§7 architectural invariant** — "Every consequential agent action is authorized by a principal-bound grant, bounded by a scope, emitted as an observable event, wrapped in provenance, stored with evidence, replayable under policy, and benchmarkable by PRISM." The Workbench is the first surface that makes this invariant *visible* to a user.

### 0.4 The central invariant (sharpest claim)

This is the line the Workbench exists to make true:

> **A Workbench skill is not valid because a model says it worked. It is valid because replay produces a structured report whose evidence satisfies declared conformance checks.**

Every architectural decision in this spec serves that invariant. Every other AI playground accepts "the model produced reasonable output" as success. The Workbench rejects that standard. Success is a `ProofResult` (§5.4) whose `overall_verdict` is `pass` against declared `proof_gates`.

### 0.5 Non-goals (v0.1)

The following are intentionally out of scope for v0.1 to prevent over-engineering:

- **No multi-tenant auth.** Session is browser-local; one user, one OpenRouter key, no server-side accounts.
- **No public skill marketplace.** Export to FleetPrompt is v0.2+. v0.1 downloads bundles as files only.
- **No leaderboard.** Per Finding 8, bundles ship before leaderboards.
- **No federation, no multi-machine replay, no FGAP.** Replay is single-browser in v0.1.
- **No skill editor / DSL.** Crystallization is read-only in v0.1; user accepts or rejects the draft manifest.
- **No new protocols.** v0.1 composes only what is already in-tree or live (STACK_COMPLETION §1, §2, §3).
- **No backend persistence by default.** Bundles live in IndexedDB + downloads; optional cloud storage is v0.2.

---

## 1. User-visible surface

### 1.1 Pages

| Route | Purpose | Persistence |
|---|---|---|
| `/` | Landing. Explain the workbench. BYO OpenRouter key field (sessionStorage). Pick a body backend (browser \| host \| simulator). | sessionStorage |
| `/teach` | Active demonstration. Task description input, body viewport, live PULSE phase timeline, "Stop recording" button. | in-memory + IndexedDB on stop |
| `/skills` | Local skill library. List of crystallized skills with name, description, replay count, last fidelity score. | IndexedDB |
| `/skills/[id]` | Skill detail. Inspect manifest, transcript, evidence, judge score, evidence bundle download. Tabs: **Manifest** / **Memory** / **Compare** / **Audit**. | IndexedDB |
| `/skills/[id]/replay` | Replay against a new input. Side-by-side view: original trace vs. current replay. Surprise signals highlighted. | IndexedDB |
| `/import` | Drop a `.skill.json` bundle from disk → IndexedDB. | IndexedDB |

### 1.2 Persistent header (amp-nav)

The standard amp-nav v0.3.3+ Web Component appears on every page (consistent with portfolio sites).

### 1.3 No persistent footer beyond a one-line version string

`Workbench v0.1.0 · [&] Protocol v0.1.0 · PULSE v0.1.1`

### 1.4 What a v0.1 skill is *not* (scope guard)

To prevent scope creep, a v0.1 Workbench skill is explicitly **not**:

- a full autonomous agent
- a deployed runtime tool
- a workflow engine with branching/loops
- a permissioned production capability
- a guaranteed deterministic program (LLM steps are non-deterministic by default; replay fidelity is structural or semantic, not always exact — see §5.5)
- a private credential container
- an executable payload (imported bundles are data, never code — see §7.5)

A v0.1 skill is: **a portable, replayable, evidence-backed behavior specification**. That definition is the upper bound on every feature decision.

### 1.5 Modes inside `/skills/[id]`

These are tabs on a single skill, **not separate pages** — they reuse the same skill state:

| Tab | What it shows | Substrate used |
|---|---|---|
| **Manifest** | The Skill Manifest JSON, editable description + name only | local |
| **Memory** | Graphonomous nodes touched by this skill (read + created) | Graphonomous `retrieve` |
| **Compare** | Re-run this skill across N OpenRouter models, side-by-side fidelity scores | OpenRouter + PRISM `observe` |
| **Audit** | Full glass-box trace: every PULSE event, every Delegatic auth, every tool call request/response hash | Bundle data only |

---

## 2. Core user flow

### 2.1 The three steps

Each step has a clear, falsifiable success criterion.

#### Step 1 — Demonstrate

1. User pastes OpenRouter key (validated client-side against `/v1/key` endpoint).
2. User picks body: `browser` (real Chromium via `body-browser-mcp`), `host` (sandboxed shell via `body-os-mcp`), or `simulator` (deterministic stand-in).
3. User writes a one-paragraph task description (becomes the seed `Goal` node).
4. User clicks **Start recording**.
5. Workbench:
   - Calls `delegatic.authorize` → grant_id (scope: this task only).
   - Emits PULSE `TopologyContext` with new `trace_id`.
   - For each cycle: `body.perceive` → LLM via OpenRouter → `body.act` → record into in-memory `InteractionTrace`.
   - All authority-sensitive actions (`file_delete`, `shell_exec` writes, etc.) gated by Delegatic policy.
6. User clicks **Stop recording**.

**Success criterion:** the `InteractionTrace` has ≥1 typed action, every action has `state_hash_before`/`state_hash_after`, and the LLM cost (from OpenRouter response headers) is reported.

#### Step 2 — Crystallize

1. Workbench POSTs the trace to FleetPrompt's `Skills.Crystallizer` (in-tree as of STACK_COMPLETION §2.2; this workbench is the first live external consumer).
2. Crystallizer returns a draft `SkillManifest` (§7.2).
3. Workbench shows the draft with editable `name` and `description` fields.
4. User clicks **Save skill** → IndexedDB.

**Success criterion:** a `SkillManifest` exists in IndexedDB with non-empty `name`, `description`, and `derived_from_trace_id`.

#### Step 3 — Replay

1. User opens `/skills/[id]/replay`, enters a new input variant.
2. Workbench:
   - Calls `delegatic.authorize` with the same scope template.
   - Re-emits PULSE phases against current substrate (NOT cached).
   - Runs `body.replay/3` (OS-011 §5.4 fail-fast) per recorded edge.
   - Emits `SurpriseSignal` when state hash diverges (per OS-011 §5.4).
3. Workbench presents a `ReplayReport` with fidelity score (`edges_committed / edges_attempted`), per-edge diff, and one of `{success, halted_at_edge_N, completed_with_surprises}`.
4. PRISM `observe` judges the replay output against the original (optional, opt-in per replay).
5. User can save replay as a new bundle.

**Success criterion:** the workbench produces a `ReplayReport` whose `status` is one of the three values above and whose `evidence_bundle_id` resolves to a valid bundle.

---

## 3. Domain model

### 3.1 Core types

| Type | Source of truth | Notes |
|---|---|---|
| `OpenRouterKey` | sessionStorage only; never persisted to IndexedDB | proxied through `/api/llm/openrouter` to keep CORS clean |
| `BodyChoice` | enum: `browser` / `host` / `simulator` | maps to one of three deployed Fly MCP servers |
| `Task` | `{ id, description, body_choice, created_at }` | the user's seed goal |
| `InteractionTrace` | OS-011 §4 (authoritative) | recorded during step 1 |
| `SkillManifest` | §7.2 of this spec | created in step 2 |
| `ReplayReport` | §7.3 of this spec | created in step 3 |
| `SkillBundle` | §7.1 of this spec | export wrapper; one per skill version |
| `EvidenceBundle` | §8 of this spec | a SkillBundle viewed as a PRISM evidence artifact |

### 3.2 Identity & state model

- All IDs are UUIDv7 (sortable by creation time).
- Browser state lives in IndexedDB store `workbench-v0`, object stores: `skills`, `traces`, `bundles`, `replays`, `keys` (empty; reserved for v0.2 encrypted-at-rest variants).
- No server-side state in v0.1. Cloudflare Worker proxy is stateless.

### 3.3 Naming convention

- Skill IDs: UUIDv7
- Skill slugs: kebab-case `[a-z0-9-]+`, user-editable, defaults to slug of `name`
- Bundle filenames on export: `<skill-slug>.v<n>.skill.json`

---

## 4. Substrate integration map

The Workbench is a thin consumer of already-deployed MCP servers. **No new MCP work is required.**

| Step | Server | MCP call | Liveness today (STACK_COMPLETION §3.4) |
|---|---|---|---|
| Authorize | `delegatic-mcp` | `authorize` | ✅ live, empty ETS store |
| Emit phase tokens | `os-pulse-mcp` | (TBD: PULSE has no `emit` MCP tool in v0.1.1; see §4.4) | ⚠️ |
| Perceive (browser) | `body-browser-mcp` | `perceive` | ✅ live (`agent-browser@0.26.0` + Chromium) |
| Perceive (host) | `body-os-mcp` | `perceive` | ✅ live (`body-os-shim` sandbox) |
| Act (browser) | `body-browser-mcp` | `act` | ✅ live |
| Act (host) | `body-os-mcp` | `act` | ✅ live |
| Store trace | `graphonomous-mcp` | `act` with `store_trace` | ✅ live |
| Crystallize | FleetPrompt HTTP | `POST /skills/crystallize` (proposed; today this is internal Elixir) | ⚠️ requires a thin HTTP endpoint on `fleetprompt` |
| Retrieve trace for replay | `graphonomous-mcp` | `retrieve` with `replay` | ✅ live |
| Replay | local body adapter | (in-browser TypeScript port of OS-011 §5.4) | ❌ new |
| Judge | `prism-eval` | `observe` | ✅ live (Phoenix LiveView app exposes the same engine) |

### 4.1 Known integration gaps that v0.1 will surface

1. **PULSE has no emit-token MCP tool** as of v0.1.1. v0.1 of the Workbench emits CloudEvents v1 envelopes **locally** (collected into the bundle) and treats `os-pulse-mcp` as schema reference only. A PULSE v0.1.2 `emit_token` tool (or accepting a vendor namespace per STACK_PLANNING §6.7) would let the Workbench publish tokens centrally; until then, the bundle IS the published record.
2. **FleetPrompt's `Crystallizer` is not yet exposed over HTTP.** v0.1 of the Workbench either (a) calls a new minimal `POST /api/skills/crystallize` route added to the FleetPrompt Phoenix app, or (b) runs a pure-TypeScript port of the Crystallizer transform locally in the browser. **Decision (§16 open question):** start with (b) for v0.1 to keep deployment scope to one frontend; promote to (a) in v0.2 when bundle publication lands.
3. **OS-011 `replay/3` has no JS reference impl.** v0.1 ports `BodyBrowser.Replay.execute/3` and `BodyOs.Replay.execute/3` (Elixir, STACK_COMPLETION §4 step 6) into TypeScript inside `workbench/app/src/lib/replay.ts`. The port is normatively required to preserve OS-011 §5.4 fail-fast behavior and SurpriseSignal emission.

### 4.2 MCP transport

Workbench connects to each Fly.io MCP server over **streamable HTTP**, performing the full session handshake: `initialize` → `notifications/initialized` → `tools/call` with `mcp-session-id` and SSE-envelope parsing. This mirrors the handshake FleetPrompt's `GraphonomousClient.HTTP` performs (STACK_COMPLETION §0, 2026-04-24 entry).

### 4.3 BYO OpenRouter contract

- The user's key never leaves the browser except to the proxy at `/api/llm/openrouter/*`.
- The proxy is a Cloudflare Worker. It **MUST**:
  - Forward `Authorization: Bearer <key>` headers untouched.
  - Strip all other request headers except `Content-Type` and `HTTP-Referer` (per OpenRouter etiquette).
  - Not log request bodies, response bodies, or the Authorization header.
  - Refuse any non-`https://openrouter.ai/api/v1/*` target.
- Cost is read from the OpenRouter response `X-Cost` / usage object and surfaced in the UI.

### 4.4 Authority

Every action passes through Delegatic. v0.1 uses a single bundled workspace policy `workbench/default-policy.json` that:

- Allows all browser reads.
- Allows browser writes (form fills, clicks) under `advisory` strength.
- Allows host shell reads.
- **Denies** host writes (`file_write`, `file_delete`, `shell_exec` with writes) unless the user explicitly toggles "destructive" mode in `/teach`.
- Records every authorization decision into the bundle.

Future PACT principal binding (STACK_PLANNING §6.14) plugs in here without UI changes.

---

## 5. Skill artifact format

### 5.1 SkillBundle (the file users download)

A SkillBundle is the canonical export format. One file per skill version.

```jsonc
{
  "bundle_version": "0.1.0",
  "bundle_id": "<uuidv7>",
  "skill_id": "<uuidv7>",
  "skill_version": 1,
  "created_at": "2026-05-25T12:34:56Z",
  "workbench_version": "0.1.0",
  "manifest": { /* §5.2 SkillManifest */ },
  "interaction_trace": { /* OS-011 §4 InteractionTrace */ },
  "proof": { /* §5.4 ProofResult — first-class, not implied by evidence */ },
  "evidence": { /* §6 EvidenceBundle inline */ },
  "content_hash": "sha256:...",
  "signature": null
}
```

**Why `proof` is a separate top-level field.** Evidence is raw — events, spans, hashes, transcripts. Proof is the *verdict* on that evidence: which gates passed, which invariants held, what the overall result was. A bundle reader must be able to answer "did this bundle prove what it claimed?" in O(1) — without re-deriving the answer from event traces. This is the response to GAP_REVIEW Gates A–F and to the central invariant (§0.4).

### 5.2 SkillManifest (the user-editable record)

```jsonc
{
  "schema": "https://opensentience.org/spec/skill-manifest/v0.1",
  "skill_id": "<uuidv7>",
  "name": "Summarize a GitHub repo",
  "slug": "summarize-github-repo",
  "description": "Visits a repo, reads the README and structure, returns a one-paragraph summary.",
  "version": 1,
  "derived_from_trace_id": "<uuidv7>",
  "body_choice": "browser",
  "inputs": [
    { "name": "repo_url", "type": "string", "required": true,
      "description": "https URL of a GitHub repo" }
  ],
  "outputs": [
    { "name": "summary", "type": "string" }
  ],
  "preconditions": [
    "OpenRouter key present",
    "body-browser-mcp reachable",
    "URL resolves to a public GitHub repo"
  ],
  "binding": "model_family_bound",
  "validated_against": [
    { "model": "anthropic/claude-opus-4-6", "fidelity": 1.0, "ts": "..." }
  ],
  "regression_probes": [],
  "fallback_behavior": "halt_on_state_hash_mismatch",
  "capabilities_required": ["&body.browser", "&memory.episodic"],
  "delegatic_policy_id": "workbench-default-v1",
  "created_at": "...",
  "updated_at": "..."
}
```

The `binding` / `validated_against` / `regression_probes` / `fallback_behavior` fields are seeded from STACK_PLANNING §4 "Skill Portability Manifest" (CL Find 1). This v0.1 spec is the **first concrete consumer** of that find, so the Skill Workshop doubles as an existence proof for Tier B row 10.

### 5.3 ReplayReport

```jsonc
{
  "replay_id": "<uuidv7>",
  "skill_id": "<uuidv7>",
  "skill_version": 1,
  "input": { "repo_url": "https://github.com/c-u-l8er/example" },
  "started_at": "...",
  "ended_at": "...",
  "edges_attempted": 14,
  "edges_committed": 14,
  "status": "success",          // | "halted_at_edge_N" | "completed_with_surprises"
  "surprise_signals": [],
  "fidelity": 1.0,
  "model_used": "anthropic/claude-opus-4-6",
  "cost_usd": 0.034,
  "evidence_bundle_id": "<uuidv7>"
}
```

### 5.4 ProofResult (first-class verdict)

```jsonc
{
  "schema": "https://opensentience.org/spec/proof-result/v0.1",
  "verifier_version": "workbench@0.1.0",
  "computed_at": "2026-05-25T12:35:00Z",
  "overall_verdict": "pass",                    // pass | partial | fail | inconclusive
  "proof_gates": [
    { "id": "gate.authority",        "verdict": "pass", "evidence_ref": "authorization.block_id" },
    { "id": "gate.trace_completeness","verdict": "pass", "evidence_ref": "trace.trace_id" },
    { "id": "gate.replay_fidelity",  "verdict": "pass", "evidence_ref": "replay_report.replay_id", "level": "structural" },
    { "id": "gate.redaction_verify", "verdict": "n/a",  "reason": "redaction_profile=none" },
    { "id": "gate.content_hash",     "verdict": "pass", "evidence_ref": "content_hash" },
    { "id": "gate.no_hidden_capability", "verdict": "pass", "reason": "all capabilities declared in manifest" }
  ],
  "invariant_results": [
    { "id": "inv.every_action_authorized",         "held": true,  "checked_n": 14 },
    { "id": "inv.state_hash_per_edge",             "held": true,  "checked_n": 14 },
    { "id": "inv.bundle_hash_reproducible",        "held": true },
    { "id": "inv.redacted_bundle_still_verifies",  "held": "n/a" }
  ],
  "authority_result":  { "decision": "allow", "policy_id": "workbench-default-v1", "denials": [] },
  "redaction_result":  { "profile": "none", "fields_stripped": [], "post_redaction_hash_matches": true },
  "replay_result":     { "status": "success", "fidelity_level": "structural", "edges_attempted": 14, "edges_committed": 14 },
  "conformance_check": { "spec_version": "0.1", "fixtures_passed": ["skill.replay_fidelity"], "fixtures_failed": [] }
}
```

The six **proof gates** map to GAP_REVIEW §5 Gates A–F where applicable, plus two Workbench-specific gates (`gate.content_hash`, `gate.no_hidden_capability` per §7.6).

A bundle whose `proof.overall_verdict` is anything other than `pass` is still a valid bundle — it just hasn't proved what it claims. The Workbench UI displays the verdict prominently on every skill detail page.

### 5.5 Fidelity levels (replay)

| Level | Meaning | Use when |
|---|---|---|
| `exact` | Deterministic re-execution; every `state_hash_after` matches the recorded trace byte-for-byte. | Tool-call-only skills (no LLM mid-trace), or skills with fixed-seed deterministic models. |
| `structural` | Schema, required fields, edge count, action types, and trace shape all match; specific text content may differ. | The v0.1 default for LLM-driven skills. |
| `semantic` | A PRISM judge (or meta-judge) confirms output equivalence at acceptable confidence. | When the user opts in to judging during replay. |
| `failed` | Replay halted before completion, or one or more required invariants did not hold. | Fail-fast on state-hash mismatch (OS-011 §5.4). |
| `inconclusive` | Replay completed but the verifier could not assign one of the above (e.g., missing reproducibility metadata, PRISM unavailable for semantic judging). | Surfaced verbatim so users do not mistake it for `pass`. |

Replay reports MUST declare exactly one level. The UI MUST visually distinguish `inconclusive` from `pass` and `failed`.

---

## 6. Evidence Bundle (`evidence` field of SkillBundle)

The Evidence Bundle is the PRISM-facing view of the same data the SkillBundle wraps for users. **Same JSON, different framing.**

```jsonc
{
  "scenario": { /* the seed Task, framed as a PRISM scenario */ },
  "system":   { "system_id": "openrouter:<model>", "byo_key": true },
  "capability_snapshot": { /* [&] primitives + subtypes active at run */ },
  "pulse_manifest_snapshot": { /* workbench's own PULSE manifest, §13 */ },
  "trace": { /* OTel-compatible spans, one per phase + tool call */ },
  "events": [ /* CloudEvents v1 envelopes: PULSE tokens */ ],
  "transcript": [ /* LLM turns */ ],
  "tool_calls": [ /* hashes of every MCP request/response */ ],
  "graphonomous_refs": [ /* node URIs touched */ ],
  "authorization": { /* Delegatic block */ },
  "judge": { /* PRISM observe output, if run */ },
  "score": { /* composite + derivation */ },
  "evidence_refs": [ /* W3C Web Annotation selectors anchoring claims */ ],
  "redaction_profile": "none",
  "reproducibility": {
    "fly_revisions": { "graphonomous-mcp": "...", "body-browser-mcp": "..." },
    "supabase_migration_count": 35,
    "ampersand_protocol_version": "0.1.0",
    "pulse_version": "0.1.1",
    "prism_version": "0.1.0",
    "workbench_version": "0.1.0"
  }
}
```

The full JSON Schema for the Evidence Bundle is at `workbench/docs/spec/EVIDENCE_BUNDLE.v0.schema.json` (to be written alongside this README).

### 6.1 Why both names

- **SkillBundle** is the user-facing artifact ("here is my skill").
- **EvidenceBundle** is the evaluator-facing artifact ("here is proof the stack works").

They are the same file because the architectural invariant (§15) requires it: every skill is also evidence; every piece of evidence is bound to a skill.

---

## 7. Privacy, security, redaction

### 7.1 What stays in the browser

- OpenRouter API key (sessionStorage only).
- All InteractionTraces and SkillManifests by default (IndexedDB).
- Body screenshots, a11y trees, terminal output.

### 7.2 What leaves the browser (per call)

- LLM prompts → OpenRouter (through the proxy).
- `body-*` perceive/act payloads → respective Fly MCP server.
- `graphonomous` store calls → Graphonomous MCP (only when user explicitly clicks "Sync skill to memory").
- `prism observe` calls → PRISM MCP (only when user runs Compare or opts in to judging).
- `delegatic authorize` calls → Delegatic MCP.

### 7.3 Redaction modes for bundle export

| Mode | What it does |
|---|---|
| `none` | Verbatim. Default. |
| `transcript_pii` | Strip free-text transcript content; keep span shapes, hashes, and structural events. |
| `full` | Keep only hashes, event types, and judge scores. Useful for sharing "this skill exists and scored X" without leaking the demo. |

The redacted bundle must still verify against the schema and against `content_hash` (the hash is computed *after* redaction). This satisfies Gate E of the gap review.

### 7.4 Data classes

Each bundle field carries an implicit class:
- transcript / screenshots / terminal output → `personal` (could contain user-typed PII)
- tool_calls hashes / event IDs / authorization blocks → `internal`
- scenario / capability_snapshot / pulse_manifest_snapshot → `public`

`transcript_pii` strips `personal`; `full` strips `personal` + `internal`-with-bodies.

### 7.5 Threat model

| Threat | Mitigation |
|---|---|
| **OpenRouter key exfiltration** | Key lives only in `sessionStorage`; proxy refuses non-`openrouter.ai` targets; no logging; CSP forbids inline scripts; Service Worker registration is disallowed in v0.1. |
| **Accidental transcript export** | Default redaction profile in the export dialog defaults to whatever the user previously chose for that skill, never silently `none`. Redaction profile name is part of the displayed bundle header. |
| **Prompt injection inside a demonstrated trace** | Treat the LLM's outputs during demonstration as adversarial inputs to the host UI. Never `eval`, never `innerHTML`-render assistant content, render through a sanitized markdown pipeline only. |
| **Malicious imported bundle** | **Imported bundles are data, never code.** The importer (`/import`) parses JSON, validates schema, and only ever instantiates declared primitive types. A bundle MUST NOT cause the Workbench to fetch arbitrary URLs, register Service Workers, eval scripts, or invoke MCP servers other than those required by its declared capabilities (§10). |
| **Fake signature** | v0.1 treats `signature` as advisory metadata; the conformance suite does not require it. v0.2 verifies Ed25519 signatures against a public-key pin set. Until then, the spec MUST display `"signature": null` and `"signed": false` rather than implying verification. |
| **Replay overclaiming** | The UI MUST present `proof.overall_verdict` literally. A `partial` or `inconclusive` verdict is never rendered as success. |
| **Model output containing user secrets** | The export dialog warns if the transcript contains string patterns matching common secret shapes (API keys, JWTs, AWS keys) and pre-selects `transcript_pii`. |
| **Browser local storage compromise** | Documented risk in v0.1; mitigation (subtle-crypto wrap with a user passphrase) deferred to v0.2 (OQ-6). |
| **CSRF on the OpenRouter proxy** | Proxy requires `Origin` header matching the deployed Workbench domain; same-origin only. |

### 7.6 No hidden authority

A hard rule, falsifiable by inspection:

> Every capability used during demonstration or replay MUST be declared in the SkillManifest's `capabilities_required` (§5.2) OR marked as `ambient` (browser-local, no MCP call).

A skill that calls an undeclared MCP server during replay fails `gate.no_hidden_capability` (§5.4) and its `overall_verdict` becomes `fail`. This gives a clean authority proof in v0.1 even before deep Delegatic principal binding (STACK_PLANNING §6.14) lands.

---

## 8. Conformance

### 8.1 Workbench-conformance checks (v0.1)

A Workbench instance is conformant if it:

1. Produces a SkillBundle that validates against `EVIDENCE_BUNDLE.v0.schema.json` for every successful demonstrate→crystallize cycle.
2. Refuses to call MCP servers without a Delegatic authorization block in scope.
3. Never persists the OpenRouter key beyond `sessionStorage`.
4. Reproduces `content_hash` byte-for-byte across two independent re-serializations of the same SkillBundle (canonical JSON).
5. On replay, halts at the first state-hash mismatch and emits a SurpriseSignal in the bundle.
6. Does not consume any protocol slot that is not already in-tree or shipped per STACK_COMPLETION §1.

### 8.2 Schema fixtures

`workbench/docs/spec/fixtures/` must contain:

- `valid-skill-bundle.v0.json` — a passing reference bundle.
- `invalid-missing-content-hash.v0.json` — must fail validation.
- `replay-success.v0.json` — a ReplayReport for a clean replay.
- `replay-state-hash-mismatch.v0.json` — a ReplayReport demonstrating fail-fast.
- `redacted-transcript_pii.v0.json` — proves a redacted bundle still verifies.

### 8.3 v0.1 acceptance criteria (Workbench is "done" when all 13 hold)

1. User opens the static Workbench at the deployed URL with no prior account.
2. User enters an OpenRouter key; key is stored in `sessionStorage` only and never reaches a server other than the OpenRouter proxy.
3. User chooses one of the five canonical fixture scenarios (§8.4) or freeform mode.
4. User runs **Demonstrate**; Workbench captures transcript, model metadata, trace events, capability usage, and authorization decisions.
5. Workbench presents a generated draft `SkillManifest` derived from the trace.
6. User edits at minimum `name` and `description`; schema validation runs on every keystroke.
7. User accepts; Workbench writes the skill to IndexedDB and offers `SkillBundle` export.
8. User exports the bundle, then re-imports the same bundle in a fresh session (or different browser); `content_hash` matches byte-for-byte.
9. User runs **Replay**; Workbench produces a `ReplayReport` whose `fidelity_level` is one of the §5.5 enum values.
10. Workbench displays a conformance panel with each `proof_gate` verdict, the `invariant_results`, and a single `overall_verdict` badge.
11. User can export a `transcript_pii`-redacted bundle whose `content_hash` (post-redaction) verifies and whose schema validates.
12. Fixture 3 (authority denial) produces `overall_verdict: fail` with `gate.no_hidden_capability` denied — and the UI surfaces this as a failure, not a success.
13. Fixture 5 (model comparison) runs the same skill against two OpenRouter models and produces two distinct `ProofResult`s side-by-side.

### 8.4 Canonical fixture scenarios (the v0.1 test set)

Each fixture has a stable ID; all are required for v0.1 to ship.

| ID | Purpose | Exercises | Pass criteria |
|---|---|---|---|
| `skill.basic_prompt_to_manifest` | Smallest end-to-end loop: one perception → one LLM call → one action → crystallize | demonstrate, crystallize, manifest gen, bundle export | bundle validates; manifest non-empty; trace ≥1 edge |
| `skill.replay_fidelity` | Replay an exported bundle against the same input | replay path, structural fidelity, ReplayReport | `fidelity_level: structural`, `overall_verdict: pass` |
| `skill.authority_denied` | Skill attempts an undeclared MCP capability mid-run | `gate.no_hidden_capability`, Delegatic decision logging | `overall_verdict: fail`, `authority_result.denials` non-empty |
| `skill.redacted_export` | Demonstration that includes a fake secret in input/transcript | `transcript_pii` redaction, post-redaction hash verify | redacted bundle validates; pattern detector pre-selected redaction |
| `skill.model_comparison` | Same skill replayed against two OpenRouter models | external validation path, dual `ProofResult` | two complete proofs; UI displays divergence if any |

Each fixture lives at `workbench/fixtures/scenarios/<id>.json` with `inputs`, `expected_outputs_shape`, `invariants_exercised`, `proof_gates_exercised`, and `pass_criteria` declared inline. This makes Workbench testable in the spec sense, not merely interactive.

---

## 9. PULSE Loop Manifest

Per CLAUDE.md and STACK_COMPLETION §1.3, every portfolio product declares its loop topology as a PULSE manifest. The Workbench's manifest is at `workbench/pulse-manifest.v0.1.json`.

```jsonc
{
  "loop_id": "workbench.skill-workshop",
  "version": "0.1.0",
  "purpose": "Skill demonstration → crystallization → replay loop",
  "phases": [
    { "id": "retrieve",    "kind": "retrieve",
      "substrate": "graphonomous", "cadence": "on_task_start",
      "outputs": ["Goal", "RelatedSkills"] },
    { "id": "route",       "kind": "route",
      "substrate": "delegatic",
      "outputs": ["AuthorizationBlock"] },
    { "id": "act",         "kind": "act",
      "substrate": "body-browser | body-os | simulator",
      "outputs": ["InteractionTrace"] },
    { "id": "learn",       "kind": "learn",
      "substrate": "fleetprompt-crystallizer",
      "outputs": ["SkillManifest"] },
    { "id": "consolidate", "kind": "consolidate",
      "substrate": "indexeddb + optional-graphonomous-sync",
      "outputs": ["SkillBundle"] }
  ],
  "cross_loop_signals": {
    "emits": [
      "TopologyContext", "OutcomeSignal", "SurpriseSignal", "ConsolidationEvent",
      "workbench.v1.SkillCrystallized", "workbench.v1.ReplayExecuted"
    ],
    "consumes": []
  },
  "invariants": [
    "Every consequential action is authorized by Delegatic",
    "Every InteractionTrace records state_hash_before and state_hash_after per edge",
    "Every SkillBundle has a verifiable content_hash"
  ],
  "substrate_dependencies": {
    "live": ["delegatic-mcp", "body-browser-mcp", "body-os-mcp", "graphonomous-mcp", "prism-eval"],
    "spec_only": ["pulse-emit-token (v0.1.2 prereq)"],
    "local": ["openrouter-proxy"]
  }
}
```

**Note:** the `workbench.v1.*` token names depend on PULSE v0.1.2's vendor-namespace mechanism (STACK_PLANNING §6.7). Until v0.1.2 ships, the tokens are recorded in the bundle locally but cannot be normatively registered with `os-pulse-mcp`. The Workbench MUST emit them locally in either case.

---

## 10. Capability contract ([&] declaration)

The Workbench's `*.ampersand.json` capability declaration lives at `workbench/workbench.ampersand.json`:

```jsonc
{
  "ampersand_version": "0.1.0",
  "name": "workbench",
  "version": "0.1.0",
  "capabilities": {
    "consumes": [
      "&memory.episodic",  // store/retrieve interaction traces
      "&reason.attend",    // OpenRouter via proxy
      "&space.region",     // browser viewport, host shell as regions
      "&body.browser",     // body-browser-mcp
      "&body.os",          // body-os-mcp
      "&govern.policy"     // delegatic
    ],
    "provides": [
      "&memory.skill_manifest"  // new subtype reserved; see §16 OQ-3
    ]
  }
}
```

`&memory.skill_manifest` is a new candidate subtype under `&memory.*`. It is **not** a new protocol — it's a typed artifact that lives inside an existing [&] primitive. Adding it does not trigger the protocol extraction gate (STACK_PLANNING §1.1).

---

## 11. Versioning & compatibility

- **Spec version** changes minor (0.1 → 0.2) when fields are added in backward-compatible ways, major (0.x → 1.0) on breaking changes.
- **Bundle `bundle_version`** matches the spec version that produced it. Workbench v0.2+ MUST read v0.1 bundles. Workbench v0.1 MAY refuse v0.2 bundles.
- **`workbench_version`** in each bundle records the producing Workbench build for reproducibility.

---

## 12. Deployment

### 12.1 Where it runs

- **Frontend**: SvelteKit static build → Cloudflare Pages (free tier; matches zero-budget constraint).
- **Proxy**: single Cloudflare Worker at `/api/llm/openrouter/*` (free tier).
- **MCP backends**: existing Fly.io services. No new infra.

### 12.2 Domain decision (deferred)

Two candidates:

1. **`opensentience.org/workbench/`** — subpath under the protocol family home. Recommended in §0.3.
2. **`runtime.ampersandboxdesign.com`** — standalone subdomain. Marketable but requires a new DNS record.

Decision deferred to deployment time; spec is domain-independent.

### 12.3 Static-site shape

```
workbench/app/build/
├── index.html                # /
├── teach/index.html          # /teach
├── skills/index.html         # /skills
├── skills/[id]/index.html    # /skills/[id]
├── skills/[id]/replay/index.html
├── import/index.html
└── _app/...                  # JS, CSS, amp-nav
```

---

## 13. Open questions

| ID | Question | Resolution path |
|---|---|---|
| OQ-1 | Should Crystallizer run in-browser (TS port) or as a FleetPrompt HTTP endpoint? | v0.1 = in-browser TS port. v0.2 = HTTP endpoint when bundle publishing lands. |
| OQ-2 | Should v0.1 require Delegatic-mcp connectivity, or fall back to a local TS authorizer? | v0.1 = require Delegatic-mcp for browser body and host body; allow local TS authorizer for simulator body only. |
| OQ-3 | Is `&memory.skill_manifest` the right place to register the SkillManifest type, or should it live under `&govern.*`? | Resolve before merging the `workbench.ampersand.json` file; raise in [&] Protocol v0.2 RFC. |
| OQ-4 | If PULSE v0.1.2 ships before Workbench v0.1, should Workbench normatively register its tokens with `os-pulse-mcp` at startup? | If PULSE v0.1.2 lands first: yes. Otherwise: defer to v0.2. |
| OQ-5 | Should ReplayReport be a top-level artifact (downloadable) or only nested inside SkillBundle? | v0.1 = nested only. v0.2 = downloadable when replay history matters. |
| OQ-6 | Encrypted-at-rest for IndexedDB bundles? | Defer. v0.1 documents the risk; v0.2 ships subtle-crypto wrapping. |
| OQ-7 | When the user signs out (closes tab), are bundles wiped? | No — IndexedDB persists. Key is wiped (sessionStorage). User can "Clear all local data" from `/skills`. |

---

## 14. Out-of-scope / deferred to v0.2+

Tracked so they aren't forgotten and aren't smuggled into v0.1:

- Publish skill to FleetPrompt marketplace
- Multi-user / accounts / shared workspaces
- Skill versioning with diff view
- Skill editing (re-record a single edge)
- Cross-skill composition (`use_skill(other_skill_id, input_mapping)`)
- Federation / cross-machine replay (depends on FGAP, see STACK_PLANNING Tier C #18)
- Encrypted bundle export
- Public leaderboard (depends on Finding 8 satisfaction, which v0.1 itself satisfies)
- PRISM Compare across >3 models in parallel
- Audit log export to OTel collector

---

## 15. Architectural invariant tracking

Per STACK_PLANNING §9 / GAP_REVIEW §7, the optimization target:

> Every consequential agent action is authorized by a principal-bound grant, bounded by a scope, emitted as an observable event, wrapped in provenance, stored with evidence, replayable under policy, and benchmarkable by PRISM.

| Clause | Workbench v0.1 status |
|---|---|
| principal-bound grant | partial — Delegatic block is workspace-scoped, not principal-bound until §6.14 lands |
| bounded by a scope | partial — Delegatic policy scopes by task; SCOPE regions are v0.2 |
| observable event | yes — every phase emits a PULSE token into the bundle |
| wrapped in provenance | yes — bundle structure IS the provenance envelope (pre-PEP) |
| stored with evidence | yes — `evidence_refs` field with Web Annotation selectors |
| replayable under policy | yes — replay re-runs `delegatic.authorize` with the same policy |
| benchmarkable by PRISM | yes — bundle IS a PRISM Evidence Bundle |

Net: v0.1 satisfies 5/7 fully and 2/7 partially. This is **the strongest single move on the planning board** for advancing the invariant from "true for zero vertical paths" toward "true for one complete vertical path."

### 15.1 Mapping to GAP_REVIEW proof gates A–F

| Gap-review gate | Workbench v0.1 mechanism | Where |
|---|---|---|
| Gate A — RLS/entitlement | n/a in v0.1 (no shared DB); inherits from MCP servers it calls | — |
| Gate B — Trace/provenance | every run produces `trace.trace_id`, PULSE events, Graphonomous refs, PEP-shaped envelope | §6, §9 |
| Gate C — Authority | `gate.authority` + `gate.no_hidden_capability` first-class in `ProofResult` | §5.4, §7.6 |
| Gate D — Replay/idempotency | bundle `content_hash` reproducible; tool-call hashes recorded; `gate.replay_fidelity` typed | §5.5, §8.3 item 8 |
| Gate E — Redaction/privacy | `transcript_pii` and `full` modes; post-redaction hash verification; fixture 4 | §7.3, §7.5, §8.4 |
| Gate F — External comparison | fixture 5 (model_comparison); PRISM `observe` integration in Compare tab | §1.5, §8.4 |

Five of six gates have first-class mechanisms in v0.1; Gate A correctly defers to upstream MCP RLS work.

---

## 16. Update log

- **2026-05-25** — v0.1 spec drafted. Anchored to STACK_ARCHITECTURE_GAP_REVIEW.md Findings 8 and 12 + Phase 0. Pivots earlier "Evidence Bundle generator" framing into "Skill Workshop" so the user's job-to-be-done is first-class and the evidence bundle falls out as a side effect (SkillBundle ≡ EvidenceBundle).
- **2026-05-25 (review pass 1)** — Folded in external review feedback that the proof layer was too implicit. Changes:
  - Title gained subtitle: *"A skill workshop and proof harness for the [&] Stack."*
  - Added §0.4 central invariant — *"A Workbench skill is not valid because a model says it worked. It is valid because replay produces a structured report whose evidence satisfies declared conformance checks."* This is the line every other architectural decision serves.
  - Added §1.4 "What a v0.1 skill is *not*" as a scope guard.
  - Promoted `proof` to a first-class top-level field of `SkillBundle` (§5.1) so a bundle reader can answer "did this prove what it claimed?" in O(1) without re-deriving from raw events.
  - Added §5.4 `ProofResult` type with six named `proof_gates`, typed `invariant_results`, `authority_result`, `redaction_result`, `replay_result`, `conformance_check`, and a single `overall_verdict` (`pass`/`partial`/`fail`/`inconclusive`).
  - Added §5.5 fidelity-level enum (`exact`/`structural`/`semantic`/`failed`/`inconclusive`) — `structural` is the v0.1 default for LLM-driven skills; `inconclusive` MUST be visually distinguished from `pass`.
  - Added §7.5 threat model covering BYOK exposure, malicious bundle import ("bundles are data, never code"), replay overclaiming, secret pattern detection, CSRF, fake signatures.
  - Added §7.6 "no hidden authority" rule — every capability used at run time must be declared in the manifest or marked ambient.
  - Added §8.3 thirteen-item v0.1 acceptance criteria.
  - Added §8.4 five canonical fixture scenarios (`skill.basic_prompt_to_manifest`, `skill.replay_fidelity`, `skill.authority_denied`, `skill.redacted_export`, `skill.model_comparison`) with stable IDs and declared pass criteria — makes the Workbench testable in the spec sense, not just interactive.
  - Added §15.1 mapping Workbench v0.1 mechanisms to GAP_REVIEW Gates A–F (five of six first-class in v0.1; Gate A correctly defers upstream).

---

*Authoritative spec lives at `/home/travis/ProjectAmp2/workbench/docs/spec/README.md` on the `main` branch.*
