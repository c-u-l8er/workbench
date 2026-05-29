# Supervisor — Build Prompt v1.1

> **Purpose:** Implementation prompt for the autonomous teacher loop ("the Principal") that closes the gap between `workbench/docs/spec/SUPERVISOR.md` (complete spec) and a working `/supervise` page. The Supervisor takes a `TeacherCharter` as commission and emits a verified `CurriculumBundle`.
>
> **Source-of-truth spec:** `workbench/docs/spec/SUPERVISOR.md` (v0.2 draft, 15 sections, panel + MCP + Registrar). This prompt does NOT replace it — it is a build order layered on top of it. When this prompt and the spec disagree, the spec wins.
>
> **Depends on:** Workbench v0.3.0-alpha already in-tree. No new MCP servers, no new schemas, no new backends. (`MCP_INVARIANT_PACK.v0.schema.json` is new but it's a sibling spec file, not a new substrate.)
>
> **Target agent:** ChatGPT-5.3-Codex in Zed (or any coding agent with file access). The author of this prompt plans in Claude; codes in Codex.
>
> **Author:** Travis / [&] Ampersand Box Design
>
> **Date:** 2026-05-27
>
> **Version:** 1.1 (matches SUPERVISOR.md v0.2 — adds MCP-tool awareness, devil's-advocate panel default-on, CellLedger scaffolding, stratified picker; fixes five drift bugs from v1.0)
>
> **Scope:** ~1,000 LOC TypeScript + ~400 LOC Svelte. Single PR. No protocol changes. No new dependencies.

## 0a. Changelog vs v1.0

The v1.0 prompt sat on top of SUPERVISOR.md v0.1. This v1.1 prompt sits on top of SUPERVISOR.md v0.2 and fixes the drift bugs flagged in the design review:

1. **Halt-reason vocabulary** now matches `lib/supervisor/bundle.ts:HaltReason` exactly (`max_skills_reached`, `consecutive_failures`, etc.) — no freelance literals in pseudocode. See §5.5.
2. **Wilson lower bound** is computed by `computeFrontier` (dedups by `cellKey`), NOT by `coverageWilsonLower(covered_array.length, ...)` which double-counts repeat-visits. See §5.5 pseudocode.
3. **Critic config**: `critic_model` is the v0.1 field, kept. v0.2 adds the optional `faculty.advocate` field. Presence of either ⇒ advocate is enabled (no separate `critic_enabled` flag).
4. **`rng_seed` plumbing**: threaded into BOTH the stratified picker AND the goal generator (OpenRouter `seed` param). Per-cell seed = `hash(rng_seed || canonical(cell))`.
5. **Dual run loop** (teach/+page.svelte AND factory/run_one.ts coexist post-PR): acknowledged as known tech debt, follow-up issue tracked in §9.

---

## 0. The one-sentence idea

**The Supervisor is the principal of the [&] skill school. It accepts an invariant + manifestation space + budget as commission, drives the existing Workbench teach loop one cell at a time, and emits a content-hashed `CurriculumBundle` that a third party can re-verify from JSON alone.**

The Workbench is the teacher. PRISM is the grader. The Supervisor is the principal who hires the teacher, designs the holdout exam, picks which cell to teach next, and signs the graduation diploma.

---

## 1. Why this exists (the gap)

Workbench v0.3.0-alpha lets a human:

1. Pick a fixture
2. Click Send → drive one teach turn
3. Click Crystallize → seal one `SkillBundle`

That's a teacher. It cannot:

- Set policy (which invariants matter, with what budget)
- Iterate across a manifestation space without a human clicking
- Hold scenarios out from the teacher so the teacher can't train-to-the-test
- Produce a curriculum-level artifact

The `SUPERVISOR.md` spec describes the missing layer. The **data layer is already shipped** (`charter.ts`, `manifestation.ts`, `coverage.ts`, `bundle.ts`, all with vitest passing). The **orchestration layer and UI are not**. This prompt builds them.

---

## 2. What already exists (do NOT rebuild)

All of these are in-tree and tested. Read them before writing anything.

| File | Exports | Tests |
|---|---|---|
| `app/src/lib/supervisor/charter.ts` | `TeacherCharter`, `validateCharter`, `parseCharter`, `charterContentHash` | `charter.test.ts` |
| `app/src/lib/supervisor/manifestation.ts` | `ManifestationCell`, `enumerateCells`, `computeFrontier`, `pickNextCell` (uniform-random) | `manifestation.test.ts` |
| `app/src/lib/supervisor/coverage.ts` | `wilsonLowerBound`, `coverageWilsonLower` | `coverage.test.ts` |
| `app/src/lib/supervisor/bundle.ts` | `CurriculumBundle`, `assembleCurriculumBundle`, `verifyCurriculumContentHash` | `bundle.test.ts` |
| `examples/charters/replay_fidelity.charter.json` | The §2.3 worked example | `example.test.ts` validates it |

Schemas:
- `app/src/lib/schemas/TEACHER_CHARTER.v0.schema.json`
- `app/src/lib/schemas/CURRICULUM_BUNDLE.v0.schema.json`

**Do not touch any of these files.** They are the contract surface this build sits on top of.

---

## 3. What you will build

Nine TypeScript files, two Svelte files, plus tests. Total: ~1,500 LOC TS + ~400 LOC Svelte.

| File | Lines (est.) | Purpose |
|---|---|---|
| `app/src/lib/factory/run_one.ts` | ~180 | Pure-function single-skill teach loop. The atomic op the Supervisor dispatches. |
| `app/src/lib/supervisor/goal_gen.ts` | ~100 | One LLM call that turns `(invariant, cell, mcp_target?)` into a goal paragraph. When `mcp_target` is set, includes the discovered tool list in the prompt. |
| `app/src/lib/supervisor/auto_manifest.ts` | ~60 | Derives `SkillManifest` (`name`, `slug`, `description`) from a goal + cell heuristically. |
| `app/src/lib/supervisor/critic.ts` | ~90 | **Devil's advocate** panel slot (v0.2 default-on when `critic_model` or `faculty.advocate` is present). Runs in a separate context from the lead teacher. Returns `{ verdict: 'consent'\|'dissent', counter_example?, rationale }`. |
| `app/src/lib/supervisor/run.ts` | ~340 | The 5-phase loop. Calls everything above + reuses `verifyBundle`. Threads `rng_seed` into picker + goal_gen. |
| `app/src/lib/supervisor/cell_ledger.ts` | ~40 | v0.2 Registrar scaffolding (write-only). Appends each cell-attempt to an IDB-backed ledger keyed by `school_ref`. No reads in v0.2; v0.3 enables stale-skill detection. |
| `app/src/lib/supervisor/mcp_pack.ts` | ~50 | Loads + validates `MCPInvariantPack` JSON against `MCP_INVARIANT_PACK.v0.schema.json`. Surfaces invariants as one-click charter templates on `/supervise`. |
| `app/src/lib/mcp/discovery.ts` | ~60 | `tools/list` discovery against a configured MCP server. Computes `server_fingerprint` (sha256 of canonical tools/list response). Used when `charter.mcp_targets[0].discovery === 'tools/list'`. |
| `app/src/lib/bundle/verify_mcp.ts` | ~80 | Three MCP-specific gates: `gate.tool_contract_compliance` (every `tool_call` edge's args/result conforms to discovered inputSchema/outputSchema), `gate.tool_idempotence` (two edges with identical `args_hash` produce identical `result_hash` when the tool is declared idempotent), `gate.tool_version_consistency` (all `tool_call` edges in a bundle target the same `server_version`). |
| `app/src/routes/supervise/+page.svelte` | ~250 | Paste-charter UI + Run button + live phase progress + frontier table + "load from MCP pack" template chooser. |
| `app/src/routes/supervise/[run_id]/+page.svelte` | ~200 | Completed-run inspector. Tabs: Charter / Skills / Coverage / Frontier / Panel / Bundle. |

Plus tests for `run_one.ts`, `goal_gen.ts`, `auto_manifest.ts`, `critic.ts`, `run.ts`, `cell_ledger.ts`, `mcp_pack.ts`, `discovery.ts`, `verify_mcp.ts` (vitest, target ~45 new tests).

---

## 4. The 5-phase loop (spec §4.1)

```
┌──────────────────────────────────────────────────────────────────┐
│                       SupervisorRun.execute()                    │
│                                                                  │
│   loop while not halted():                                       │
│     ┌────────┐  ┌───────┐  ┌─────┐  ┌───────┐  ┌─────────────┐   │
│     │RETRIEVE│→ │ ROUTE │→ │ ACT │→ │ LEARN │→ │ CONSOLIDATE │   │
│     └────────┘  └───────┘  └─────┘  └───────┘  └─────────────┘   │
│        │           │          │         │             │          │
│     prior      pick next   teach one  verify     emit Curr-      │
│     bundles    cell from   skill via  bundle +   iculumBundle    │
│     (IDB)      frontier    run_one    update     when halted     │
│                                       frontier                   │
└──────────────────────────────────────────────────────────────────┘
```

Halt on the FIRST of (spec §4.2). The `HaltReason` union in `lib/supervisor/bundle.ts` is authoritative — **use those exact string literals**:

| Condition | `HaltReason` literal |
|---|---|
| `skills_produced >= charter.budget.max_skills` | `'max_skills_reached'` |
| `dollars_spent >= charter.budget.max_dollars` (if set) | `'max_dollars_reached'` |
| `wallclock_seconds >= charter.budget.max_seconds` (if set) | `'max_seconds_reached'` |
| `coverage.wilson_lower_bound >= charter.rubric.coverage_target` (if set) | `'coverage_target_reached'` |
| `frontier_remaining` is empty | `'frontier_empty'` |
| Three consecutive failed teach attempts (defensive) | `'consecutive_failures'` |
| `AbortController.abort()` from the UI | `'user_aborted'` |

Drift bug fix (v1.0 → v1.1): the prior pseudocode used `'max_skills'`/`'max_dollars'`/`'three_consecutive_failures'` — those literals do NOT exist in `bundle.ts:HaltReason`. v1.1 pseudocode in §5.5 uses the table above verbatim.

---

## 5. File-by-file contracts

### 5.1 `lib/factory/run_one.ts`

Pure-function single-skill teach loop. Extracts the logic currently inlined in `routes/teach/+page.svelte`. The Svelte page can be refactored to call this in a later PR; do NOT refactor `teach/+page.svelte` in this build. Just create the extracted module and use it from `supervisor/run.ts`.

```ts
export interface RunOneArgs {
  goal: string;
  body: BodyChoice;
  model: string;
  capabilities_required: Capability[];
  useDelegatic: boolean;
  // Optional pre-seeded edges (scripted, from a fixture). The teach loop
  // splices these in before sealing. Mirrors the existing teach flow.
  scripted_edges?: Array<Pick<TraceEdge, 'kind' | 'capability' | 'observation'>>;
  // Hooks for live UI updates (optional).
  on_edge?: (edge: TraceEdge) => void;
  on_phase?: (phase: 'turn' | 'authorize' | 'verify' | 'seal') => void;
}

export interface RunOneResult {
  bundle: SkillBundle;
  report: VerifyReport;          // from verifyBundle
  manifest: SkillManifest;
  dollars_spent: number;         // estimate from token counts × model price
  tokens_consumed: number;
  wallclock_seconds: number;
}

export async function runOne(args: RunOneArgs): Promise<RunOneResult>;
```

Implementation notes:
- Reuse `lib/openrouter.ts` for LLM, `lib/trace.ts` for `newTrace`/`appendEdge`, `lib/bundle/builder.ts` for assembly, `lib/bundle/verify.ts` for verification, `lib/storage.ts` for IDB writes.
- Wrap each phase in try/catch and surface failures as `RunOneResult` with `report.overall_verdict = 'inconclusive'` and a `report.error` field rather than throwing — `supervisor/run.ts` needs to count failures without unwinding the loop.
- Dollars: estimate `prompt_tokens × $0.000003 + completion_tokens × $0.000015` for Haiku, scale linearly for other models. Don't worry about exact prices — `max_dollars` is a soft cap; the user accepts ±2× error.

### 5.2 `lib/supervisor/goal_gen.ts`

```ts
export interface GoalGenArgs {
  invariant: InvariantRef;       // from TeacherCharter
  cell: ManifestationCell;
  required_capabilities: Capability[];
  forbidden_capabilities: Capability[];
  model: string;                 // charter.faculty.goal_gen ?? charter.model
  // v0.2 MCP awareness — when set, the goal_gen prompt is biased to
  // produce goals that invoke these tools. Pulled from charter.mcp_targets[0]
  // after discovery resolves the tool list.
  mcp_context?: {
    server_id: string;
    server_version: string;
    server_fingerprint: string;
    tools: Array<{ name: string; description?: string; inputSchema?: object }>;
  };
  // v0.2 seed plumbing — combined with the cell key for per-cell reproducibility.
  rng_seed?: number;
}

export interface GoalGenResult {
  goal: string;                  // the paragraph fed into runOne()
  dollars_spent: number;
  tokens_consumed: number;
}

export async function generateGoal(args: GoalGenArgs): Promise<GoalGenResult>;
```

Implementation: the exact prompt template is in spec §4.3. One LLM call. Set `temperature: 0.3`, `seed: hash(rng_seed ?? 0, cellKey(cell))` for reproducibility (v0.2 plumbs `rng_seed` from the charter into BOTH the stratified picker AND OpenRouter's `seed` param here).

The goal_gen **MUST NOT** see the gate's executable predicate (anti-collusion §0.4 + §4.5). It sees only `invariant.formal_definition` (prose). When `mcp_context` is set, append: "The skill MUST contain at least one `tool_call` edge against server `${server_id}@${server_version}` using one of: [tool names]."

### 5.3 `lib/supervisor/auto_manifest.ts`

```ts
export function autoManifest(args: {
  goal: string;
  cell: ManifestationCell;
  charter: TeacherCharter;
}): {
  name: string;
  slug: string;
  description: string;
  capabilities_required: Capability[];
};
```

Implementation:
- `name`: title-case first 6 words of `goal`
- `slug`: kebab-case of `name` + `-` + `cellKey(cell)` (first 8 chars hex)
- `description`: `goal` truncated to 280 chars
- `capabilities_required`: copy `charter.rubric.required_capabilities` (or `['ambient']` if empty)

Pure synchronous function. No LLM call. Spec §4.4 says "auto-fill harness shipped with Workbench v0.3" — this IS that harness; we ship it here.

### 5.4 `lib/supervisor/critic.ts`

The **devil's advocate** panel slot. v0.2 ships default-on whenever `charter.critic_model` OR `charter.faculty.advocate` is present (there is NO separate `critic_enabled` flag — drift bug fix #3).

```ts
export interface CriticArgs {
  invariant: InvariantRef;
  cell: ManifestationCell;
  bundle: SkillBundle;
  model: string;          // charter.faculty.advocate ?? charter.critic_model ?? charter.model
  // v0.2: when the lead teacher hit a tool_call edge, the advocate gets
  // the discovered tool list and is asked to propose a counter-example
  // input that would have caused the gate to fail.
  mcp_context?: GoalGenArgs['mcp_context'];
  // Per-cell seed so advocate is reproducible alongside teacher + picker.
  rng_seed?: number;
}

export interface CriticVerdict {
  verdict: 'consent' | 'dissent';
  rationale: string;
  // v0.2: when dissenting, the advocate MUST produce a concrete counter-example
  // (args / cell coordinates that would have exposed the cheap-pass).
  // Surfaced into CurriculumBundle.invariant_claims[].counter_example.
  counter_example?: Record<string, unknown>;
  dollars_spent: number;
  tokens_consumed: number;
}

export async function critique(args: CriticArgs): Promise<CriticVerdict>;
```

**Anti-collusion contract (spec §4.5):** the advocate MUST be invoked in a SEPARATE openrouter context (separate request, no shared conversation history) from the lead teacher — even when both `faculty.lead` and `faculty.advocate` reference the same model. Implementation: call `lib/openrouter.ts` with a fresh `messages: []` array and no `conversation_id`. Verify this with a structural test (see §8).

**Authority contract:** the advocate's verdict is **advisory only**. `verifyBundle` (the examiner) is the sole authority for `passed`. The advocate's dissent is recorded in `CurriculumBundle.invariant_claims[].critic_dissent` and `counter_example`, plus aggregated into `panel_summary.advocate_dissent`. It does NOT flip `passed`.

### 5.5 `lib/supervisor/run.ts`

The orchestrator. The principal.

```ts
export interface SupervisorRunArgs {
  charter: TeacherCharter;
  // Optional hooks for live UI progress (called from each phase transition).
  on_phase?: (event: SupervisorPhaseEvent) => void;
  on_skill?: (skill: { bundle_id: string; verdict: Verdict; cell: ManifestationCell }) => void;
  on_halt?: (reason: HaltReason) => void;
  // For deterministic testing.
  rng_seed?: number;
}

export type SupervisorPhaseEvent =
  | { phase: 'retrieve'; cells_total: number; cells_visited: number }
  | { phase: 'route'; next_cell: ManifestationCell }
  | { phase: 'act'; goal: string; cell: ManifestationCell }
  | { phase: 'learn'; verdict: Verdict; covered: boolean }
  | { phase: 'consolidate'; reason: HaltReason };

export interface SupervisorRunResult {
  curriculum: CurriculumBundle;
  halt_reason: HaltReason;
  run_id: string;
}

export async function executeSupervisorRun(
  args: SupervisorRunArgs
): Promise<SupervisorRunResult>;
```

Pseudocode (read spec §4.1 + §4.2 + §4.6 alongside this). **Two drift bugs from v1.0 are fixed below**: halt-reason literals match `bundle.ts:HaltReason` (#1); coverage is computed via `computeFrontier()` which dedups by `cellKey` instead of growing a `covered[]` array that double-counts (#2).

```ts
const cells = enumerateCells(charter.manifestation_space, charter.manifestation_excludes);
const attempts: Array<{ cell: ManifestationCell; passed: boolean }> = [];
const skillRefs: SkillBundleRef[] = [];
const claims: InvariantClaim[] = [];
const budget = { skills: 0, dollars: 0, tokens: 0, started_at: Date.now() };
let consecutive_failures = 0;

// v0.2: resolve MCP target once, before the loop, so all skills share
// the same fingerprint. Also surfaced into curriculum.mcp_targets_resolved.
const mcp_context = charter.mcp_targets?.[0]
  ? await discoverMcpTarget(charter.mcp_targets[0])  // tools/list + fingerprint
  : undefined;

while (true) {
  // RETRIEVE — v0.1 no-op; v0.2 reads cell_ledger for school_ref if set
  const { cells_visited, cells_covered, wilson_lower_bound, frontier_remaining } =
    computeFrontier(cells, attempts);
  on_phase?.({ phase: 'retrieve', cells_total: cells.length, cells_visited });

  // ROUTE — stratified picker (spec §4.6), seeded by charter.rng_seed
  if (frontier_remaining.length === 0) return halt('frontier_empty');
  const next = pickNextCell(frontier_remaining, attempts, charter.rng_seed);
  on_phase?.({ phase: 'route', next_cell: next });

  // ACT — goal_gen + autoManifest + runOne (lead teacher), then optional advocate
  const { goal, dollars_spent: gd, tokens_consumed: gt } = await generateGoal({
    invariant: charter.invariant_ref,
    cell: next,
    required_capabilities: charter.rubric.required_capabilities ?? [],
    forbidden_capabilities: charter.rubric.forbidden_capabilities ?? [],
    model: charter.faculty?.goal_gen ?? charter.model,
    mcp_context,
    rng_seed: charter.rng_seed,
  });
  budget.dollars += gd; budget.tokens += gt;
  const manifest = autoManifest({ goal, cell: next, charter });
  on_phase?.({ phase: 'act', goal, cell: next });
  const r = await runOne({
    goal, body: charter.body ?? 'simulator',
    model: charter.faculty?.lead ?? charter.model,
    capabilities_required: manifest.capabilities_required,
    useDelegatic: charter.delegatic ?? true,
  });
  budget.dollars += r.dollars_spent; budget.tokens += r.tokens_consumed;
  budget.skills += 1;

  // Devil's advocate — default-on when critic_model OR faculty.advocate set
  const advocateModel = charter.faculty?.advocate ?? charter.critic_model;
  const advocateVerdict = advocateModel
    ? await critique({
        invariant: charter.invariant_ref,
        cell: next, bundle: r.bundle,
        model: advocateModel,
        mcp_context,
        rng_seed: charter.rng_seed,
      })
    : undefined;
  if (advocateVerdict) { budget.dollars += advocateVerdict.dollars_spent; budget.tokens += advocateVerdict.tokens_consumed; }

  // LEARN — examiner (verifyBundle) is authority; advocate is advisory
  const passed = r.report.overall_verdict === 'pass';
  attempts.push({ cell: next, passed });
  consecutive_failures = passed ? 0 : consecutive_failures + 1;
  skillRefs.push({
    content_hash: r.bundle.content_hash,
    manifestation: next,
    skill_slug: manifest.slug,
    verdict: r.report.overall_verdict,
  });
  // v0.2: claims now record ALL gates run (6 v0.1 + any MCP gates), not just charter invariant gate.
  claims.push(...claimsForAllGates(r, charter.invariant_ref, advocateVerdict));
  if (charter.school_ref) await appendCellLedger(charter.school_ref, { cell: next, passed, content_hash: r.bundle.content_hash });
  on_phase?.({ phase: 'learn', verdict: r.report.overall_verdict, covered: passed });
  on_skill?.({ bundle_id: r.bundle.bundle_id, verdict: r.report.overall_verdict, cell: next });

  // CONSOLIDATE — halt-check using HaltReason vocabulary from bundle.ts
  if (consecutive_failures >= 3) return halt('consecutive_failures');
  if (budget.skills >= charter.budget.max_skills) return halt('max_skills_reached');
  if (charter.budget.max_dollars && budget.dollars >= charter.budget.max_dollars) return halt('max_dollars_reached');
  if (charter.budget.max_seconds && (Date.now() - budget.started_at) / 1000 >= charter.budget.max_seconds) return halt('max_seconds_reached');
  if (charter.rubric.coverage_target && wilson_lower_bound >= charter.rubric.coverage_target) return halt('coverage_target_reached');
  if (abortSignal?.aborted) return halt('user_aborted');
}

function halt(reason: HaltReason): SupervisorRunResult {
  on_phase?.({ phase: 'consolidate', reason });
  on_halt?.(reason);
  const frontier = computeFrontier(cells, attempts);  // recompute final, dedup'd
  const curriculum = await assembleCurriculumBundle({
    charter, skillRefs, claims, frontier,
    mcp_targets_resolved: mcp_context ? [mcp_context] : undefined,
    panel_summary: summarizePanel(claims),
    halt_reason: reason,
    budget_consumed: budget,
  });
  await putCurriculum(curriculum);
  return { curriculum, halt_reason: reason, run_id: curriculum.curriculum_id };
}
```

**Wilson semantics fix (drift bug #2):** `computeFrontier(cells, attempts)` is the single source of truth. It returns `cells_covered` as the count of DISTINCT cells with ≥1 pass (dedup'd by `cellKey`), not the length of the `attempts` array. The earlier v1.0 pseudocode that did `covered.push(next)` and then `coverageWilsonLower(covered.length, cells.length)` over-counted repeat-passes on the same cell. The reference impl in `lib/supervisor/manifestation.ts` already does the dedup correctly — this pseudocode just calls into it.

### 5.6 `routes/supervise/+page.svelte`

Single page with two columns:

```
┌─────────────────────────┬────────────────────────────────────────┐
│ CHARTER (left, 1/3)     │ LIVE RUN (right, 2/3)                  │
│                         │                                        │
│  [textarea]             │  Phase: act                            │
│  paste JSON or pick     │  Current cell: { body: simulator,      │
│  pre-built              │                  turn_count: short,    │
│                         │                  ... }                 │
│  [Run charter]          │                                        │
│                         │  Frontier: 8/36 visited (Wilson .19)   │
│  [validation status]    │                                        │
│                         │  Budget: 8/12 skills · $0.42/$1.50 ·   │
│                         │          318s/900s                     │
│                         │                                        │
│                         │  Skills produced (table):              │
│                         │   # | slug | cell | verdict            │
│                         │   1 | ...  | ...  | pass                │
│                         │   2 | ...  | ...  | fail                │
│                         │   ...                                  │
│                         │                                        │
│                         │  [stop] [view bundle on completion]    │
└─────────────────────────┴────────────────────────────────────────┘
```

UI requirements (spec §11 AC #8):
- Each phase transition reflected in the DOM within 500ms — use `on_phase` callback to update a Svelte writable store.
- "Stop" button calls `controller.abort()` on an `AbortController` passed into `executeSupervisorRun` (you may extend the signature to accept one).
- On halt, navigate to `/supervise/[run_id]` automatically.

### 5.7 `routes/supervise/[run_id]/+page.svelte`

Six tabs over a completed `CurriculumBundle`:

| Tab | Content |
|---|---|
| **Charter** | Render the TeacherCharter (read-only JSON viewer with a "Copy" button) |
| **Skills** | Table of `skill_bundles[]` with click-through to `/skills/[content_hash]` |
| **Coverage** | Wilson lower bound, cells visited/total, `frontier_remaining`, `intentionally_excluded` |
| **Frontier** | Same as Coverage's `frontier_remaining` but pretty-printed and searchable |
| **Panel** | v0.2: `panel_summary` (examiner_pass / advocate_consent / advocate_dissent counts) + up to 5 `advocate_dissent_examples` with counter-examples. Plus a "MCP target resolved" block showing `mcp_targets_resolved[0]` (server_version, server_fingerprint, tools_observed) when set. |
| **Bundle export** | Big "Download CurriculumBundle JSON" button + content_hash display + "Verify hash" button that re-canonicalizes and confirms |

### 5.8 `lib/supervisor/cell_ledger.ts`

v0.2 Registrar scaffolding — **write-only** in this PR. The full Registrar (CellLedger reads, InvariantLedger, TeacherLedger, AlumniLedger) lands in v0.3.

```ts
export interface CellLedgerEntry {
  cell: ManifestationCell;
  cell_key: string;          // canonical key from manifestation.ts
  passed: boolean;
  content_hash: string;      // sha256 of the produced SkillBundle
  charter_id: string;
  curriculum_id: string;
  timestamp: string;         // ISO-8601
}

// Append-only. v0.2 has no reads (the loop derives coverage from in-memory `attempts[]`).
export async function appendCellLedger(school_ref: string, entry: CellLedgerEntry): Promise<void>;
```

IDB store: `cell_ledger`, keyPath `id` (auto-increment). One index on `school_ref`. **Do not** read from this in v0.2 — the loop owns its own `attempts[]`. The ledger exists so v0.3 can do stale-skill detection without a schema migration.

### 5.9 `lib/supervisor/mcp_pack.ts`

Loads + validates `MCPInvariantPack` JSON. Used by the `/supervise` UI to populate the "load template" dropdown.

```ts
export interface MCPInvariantPack {
  spec_version: '0.1';
  server_id: string;
  server_version: string;
  server_fingerprint?: string;
  tools: Array<{ name: string; idempotent?: boolean; side_effecting?: boolean; inputSchema?: object; outputSchema?: object; description?: string }>;
  invariants: Array<{
    invariant_id: string;
    family: 'topological' | 'temporal' | 'governance' | ... ;
    formal_definition?: string;
    proof_gate: string;
    applies_to_tools: string[];
    suggested_manifestation_space?: Array<{ dimension: string; values: string[] }>;
    sample_charter_uri?: string;
  }>;
  registrar_hints?: { stale_after_version_bump?: boolean; preferred_advocate_model?: string };
}

export function loadMcpPack(json: unknown): MCPInvariantPack;   // throws on invalid
export function packToCharter(pack: MCPInvariantPack, invariant_id: string, budget: Charter['budget']): TeacherCharter;
```

`packToCharter` is the one-click template: pick an invariant from the pack → get a draft TeacherCharter pre-filled with `invariant_ref`, `manifestation_space` from `suggested_manifestation_space`, and `mcp_targets[0]` pointing at the server. User can edit before running.

### 5.10 `lib/mcp/discovery.ts`

```ts
export interface DiscoveredMcpTarget {
  server_id: string;
  server_version: string;
  server_fingerprint: string;       // sha256 of canonical tools/list response
  tools: Array<{ name: string; description?: string; inputSchema?: object; outputSchema?: object }>;
}

export async function discoverMcpTarget(target: McpTargetRef): Promise<DiscoveredMcpTarget>;
```

Implementation:
- `target.discovery === 'tools/list'` → call the configured MCP server's `tools/list` method. Canonicalize the JSON response (sort keys, no trailing whitespace), sha256, prefix `sha256:` → that's `server_fingerprint`.
- `target.discovery === 'explicit'` → use `target.tool_subset` directly. `server_fingerprint` is `sha256:` + hash of the explicit subset (so the bundle still records SOMETHING citable).
- If `target.server_fingerprint` is set on the charter, verify the discovered fingerprint matches; throw if drift (spec §5.5).

v0.2 only handles 1 target (`mcp_targets.maxItems = 1`). Multi-server lands v0.3.

### 5.11 `lib/bundle/verify_mcp.ts`

Three MCP-specific gates that ONLY run when the bundle contains ≥1 `tool_call` trace edge.

```ts
export interface ToolCallEdge extends TraceEdge {
  kind: 'tool_call';
  server_id: string;
  server_version: string;
  tool_name: string;
  args_hash: string;        // sha256 of canonical(args)
  result_hash: string;      // sha256 of canonical(result)
  args?: unknown;           // for replay verification
  result?: unknown;
}

export interface McpGateReport {
  gate: 'gate.tool_contract_compliance' | 'gate.tool_idempotence' | 'gate.tool_version_consistency';
  passed: boolean;
  details: string;
}

export async function verifyMcpGates(bundle: SkillBundle, discovered: DiscoveredMcpTarget): Promise<McpGateReport[]>;
```

Gate semantics:

| Gate | Predicate |
|---|---|
| `gate.tool_contract_compliance` | For every `tool_call` edge, `args` validates against the discovered `inputSchema` AND `result` validates against `outputSchema`. Use ajv. **fail** on any violation. |
| `gate.tool_idempotence` | Group `tool_call` edges by `(tool_name, args_hash)`. For tools where the MCP pack declared `idempotent: true`, every group MUST have ≤1 distinct `result_hash`. **fail** if a divergent group is found. Tools without `idempotent: true` are skipped. |
| `gate.tool_version_consistency` | All `tool_call` edges in the bundle MUST share the same `server_version`. If `charter.mcp_targets[0].server_version` is pinned, edges MUST match it too. |

These plug into `lib/bundle/verify.ts` as additional gates appended to the existing 6 v0.1 gates. `claimsForAllGates` (called from `run.ts`) records ALL 6-9 gate results into `CurriculumBundle.invariant_claims[]`.

---

## 6. IndexedDB schema delta

Add TWO new stores to `lib/storage.ts`:

```ts
// stores: 'skills', 'traces', 'bundles', 'replays', 'curricula' (NEW), 'cell_ledger' (NEW v0.2)
const STORE_NAMES = ['skills', 'traces', 'bundles', 'replays', 'curricula', 'cell_ledger'] as const;

// New CRUD (curricula):
export async function putCurriculum(c: CurriculumBundle): Promise<void>;
export async function getCurriculum(id: string): Promise<CurriculumBundle | undefined>;
export async function listCurricula(): Promise<CurriculumBundle[]>;

// New CRUD (cell_ledger) — write-only in v0.2; readers land v0.3
export async function putCellLedgerEntry(school_ref: string, entry: CellLedgerEntry): Promise<void>;
```

Bump the IDB version from 1 → 2 and migrate by adding both stores. `cell_ledger` uses auto-increment keys with a `school_ref` index. The existing stores must remain untouched.

---

## 7. Acceptance criteria (spec §11 verbatim)

A v0.2 ship requires 16/16 green:

1. ✅ A valid TeacherCharter JSON validates against the schema — **already passing** (`charter.test.ts`, `example.test.ts`)
2. ✅ An invalid TeacherCharter fails with a clear error — **already passing**
3. ⬜ The 5-phase loop runs end-to-end against `examples/charters/replay_fidelity.charter.json` and produces a CurriculumBundle — **new e2e test, preview-tool driven**
4. ✅ CurriculumBundle `content_hash` re-computes byte-for-byte after JSON round-trip — **already passing** (`bundle.test.ts`)
5. ⬜ A third party (fresh vitest worker, no IDB) re-verifies a CurriculumBundle from JSON alone — **add test**
6. ✅ Wilson lower bound matches hand-computed value within 1e-6 — **already passing** (`coverage.test.ts`)
7. ⬜ Budget enforcement halts on each of the 7 `HaltReason` literals — **`run.test.ts` with mocked `runOne`, one test per literal**
8. ⬜ `/supervise` shows live phase progress (each transition < 500ms in DOM) — **preview-tool test**
9. ⬜ A produced SkillBundle compiled to SKILL.md validates against the agentskills.io frontmatter schema — **defer to follow-up PR if SKILL.md compiler doesn't exist yet; otherwise add test**
10. ⬜ Advocate dissent (when faculty.advocate or critic_model set) appears on the bundle but does NOT override the examiner — **`critic.test.ts`**
11. ⬜ **v0.2 net-new — Stratified picker**: with a fixed `rng_seed`, the picker reproducibly visits cells in a deterministic order, and never returns a cell already in `attempts[]` until all cells have been attempted once — **`manifestation.test.ts` extension**
12. ⬜ **v0.2 net-new — MCP charter end-to-end**: a charter with `mcp_targets[0].server_id = 'graphonomous'` runs against a stub discovery that returns 3 tools, produces a bundle whose `tool_call` edges all match the discovered inputSchema, and surfaces `mcp_targets_resolved` on the curriculum — **`run.test.ts` with stubbed discovery**
13. ⬜ **v0.2 net-new — MCPInvariantPack validation**: a valid pack loads; an invalid pack (missing `proof_gate`, unknown `family`) is rejected with a clear error — **`mcp_pack.test.ts`**
14. ⬜ **v0.2 net-new — All-gate claims**: with the v0.2 expansion, each skill contributes ≥6 entries to `invariant_claims[]` (one per v0.1 gate) + extra entries when MCP gates fire — **`run.test.ts` assertion on claim count**
15. ⬜ **v0.2 net-new — CellLedger persistence**: when `charter.school_ref` is set, every visited cell produces exactly one entry in the `cell_ledger` IDB store — **`cell_ledger.test.ts`**
16. ⬜ **v0.2 net-new — Anti-collusion structural test**: when `faculty.lead === faculty.advocate` (same model), the advocate's openrouter call MUST receive `messages: []` with no prior turns from the lead's call. Verify via a spy on `lib/openrouter.ts` that the two calls' `messages` arrays are disjoint — **`critic.test.ts` extension**

Items 3, 5, 7, 8, 10, 11–16 are this PR's test deliverables. Item 9 may be deferred.

---

## 8. Testing protocol

Run before committing:

```bash
cd workbench/app
npm test                    # all vitest must pass — target +45 new tests on top of 132 existing
npm run check               # typecheck — don't regress from current 26 errors
npm run dev                 # start preview server
# Then via agent-browser (CLAUDE.md default): /supervise → paste the example charter → Run → verify CurriculumBundle appears
```

Use `agent-browser` (the repo default, per `CLAUDE.md`) to verify the live run loop. `preview_*` tools are still fine for dev-server management; use `agent-browser` once the server is running.

**Holdout discipline (spec §0.4):** Add ONE test (`run.test.ts`) that verifies the gate verdict is computed by `verifyBundle` — NOT by the goal generator, NOT by the advocate, NOT by anything inside `run.ts`. Stub `verifyBundle` to return `{ overall_verdict: 'fail' }` and confirm the resulting CurriculumBundle reports `fail` even when the advocate returns `consent`. This test enforces "supervisor does not grade its own homework."

**Anti-collusion structural test (spec §4.5):** Add ONE test (`critic.test.ts`) that spies on `lib/openrouter.ts`. When `faculty.lead === faculty.advocate` (same model), verify the advocate's call's `messages[]` is disjoint from the lead's call's `messages[]` — i.e. the advocate gets a fresh context. This is the structural enforcement of the panel's anti-collusion contract.

**MCP gate test (spec §5.4):** Add `verify_mcp.test.ts` with three cases:
- A bundle whose `tool_call` edges all conform to the discovered schemas → all 3 MCP gates pass.
- A bundle where one `tool_call` has args violating `inputSchema` → `gate.tool_contract_compliance` fails.
- A bundle with two `tool_call` edges declared `idempotent: true`, same `args_hash`, different `result_hash` → `gate.tool_idempotence` fails.

---

## 9. Scope guards — what NOT to do

This PR is BIG ENOUGH. Resist the temptation to:

- ❌ Refactor `routes/teach/+page.svelte` to use `factory/run_one.ts`. That's drift bug #5 — known tech debt; separate PR. For now, the teach page and the Supervisor both call into `run_one.ts` independently.
- ❌ Add multi-invariant charters. Spec §0.5 forbids it; deferred to v0.3.
- ❌ Add multi-server MCP charters. v0.2 schema enforces `mcp_targets.maxItems = 1`; deferred to v0.3.
- ❌ Build the full Registrar (CellLedger reads, InvariantLedger, TeacherLedger, AlumniLedger). v0.2 only ships **write-only** CellLedger scaffolding. Spec §8.4 defers the reads to v0.3.
- ❌ Implement information-gain / Wilson-upper-bound routing. v0.2 uses stratified picking; Wilson-frontier picking is v0.3 (spec §6.5).
- ❌ Build a CLI runner. Spec §13 defers it.
- ❌ Wire PRISM live ingest. Gated on PRISM-side endpoint.
- ❌ Add scenario synthesis (Reflect → Composer → LLM → Compose closed loop). Out of scope; separate prompt.
- ❌ Build a charter marketplace. Spec §0.5 forbids it.
- ❌ Introduce new MCP servers (the schema for one is fine — `MCP_INVARIANT_PACK.v0.schema.json` is sibling spec, not a server).
- ❌ Touch `charter.ts`, `manifestation.ts`, `coverage.ts`, `bundle.ts` for behavior changes — they're the contract. v0.2 schema fields are additive only (already merged).

If any of these tempt you, write a follow-up issue and move on.

---

## 10. Why this earns the title "Principal"

Without the orchestrator, the Workbench is a teacher pushing buttons. With the orchestrator:

| Principal role | How this PR delivers it |
|---|---|
| Set curriculum policy | TeacherCharter is the policy artifact |
| Pick what to teach next | `route` phase + `pickNextCell` |
| Run a teacher leaderboard | Charter pins the model; aggregate verdicts in `CurriculumBundle.prism_scores` |
| Grade with a separate eye | `verifyBundle` is the grader; spec §0.4 invariant is enforced by the holdout test in §8 |
| Ship graduates, retire alumni | `CurriculumBundle` is the graduation diploma; retirement is a v0.2 concern |
| Self-improve the school | Deferred (scenario synthesis is a separate prompt) |
| Hire teachers | Charter's `model` field is the hire |
| Decide graduation | Halt conditions in §4.2 |

This is the smallest thing that earns the title. Subsequent prompts will close the remaining principal roles (scenario synthesis, regret-based routing, teacher leaderboard persistence across runs).

---

## 11. Companion docs to read before coding

In order:

1. `workbench/docs/spec/SUPERVISOR.md` — the spec this implements (~675 lines)
2. `workbench/app/src/lib/supervisor/charter.ts` — the data contract (~380 LOC)
3. `workbench/app/src/lib/supervisor/manifestation.ts` — frontier helpers (~140 LOC)
4. `workbench/app/src/lib/supervisor/bundle.ts` — output assembly (~180 LOC)
5. `workbench/app/src/routes/teach/+page.svelte` — the loop you're extracting (~470 LOC)
6. `workbench/app/src/lib/bundle/verify.ts` — the grader (do NOT modify)
7. `STACK_PERIODIC_TABLE_OF_AGENT_INVARIANTS.html` — the invariant catalogue

Don't read all the other [&] stack docs first. They're context, not requirements. The seven above are sufficient.

---

## 12. Definition of done

A successful build of this prompt produces:

- ✅ 11 new files (9 TS + 2 Svelte) + 1 IDB-schema delta in `storage.ts` (two new stores)
- ✅ +45 new vitest tests (175+ total) all green
- ✅ `npm run check` count not regressed (≤ 26 errors)
- ✅ Live `/supervise` page demonstrating the `replay_fidelity` charter producing a CurriculumBundle with N ≤ 12 skills + Wilson coverage + (when applicable) panel summary + (when applicable) `mcp_targets_resolved`
- ✅ `/supervise/[run_id]` viewable on completed runs with 6 tabs (Charter / Skills / Coverage / Frontier / Panel / Bundle)
- ✅ One PR, one commit message, no protocol changes
- ✅ 16/16 acceptance criteria green (§7)

When all seven bullets are green, the Workbench has a principal. Ship.

---

## 13. Update log

- **2026-05-27** — v1.0 initial. Built on top of the SUPERVISOR.md spec (2026-05-25) and the in-tree data layer that shipped alongside it. Companion to KAPPA_DELIBERATOR_PROMPT.md and ATTENTION_ENGINE_PROMPT.md in tone and structure; lives in `workbench/docs/spec/` (not `AmpersandBoxDesign/prompts/`) because the Supervisor is a Workbench-scoped component.
- **2026-05-27** — v1.1. Re-anchored on SUPERVISOR.md v0.2 (panel + MCP-tool awareness + Registrar scaffolding + stratified picker). Fixes five drift bugs flagged in the design review (§0a). Adds four new file contracts (`cell_ledger.ts`, `mcp_pack.ts`, `mcp/discovery.ts`, `bundle/verify_mcp.ts`). Expands acceptance criteria from 10 → 16 (six v0.2 net-new tests: stratified picker, MCP charter e2e, MCPInvariantPack validation, all-gate claims, CellLedger persistence, anti-collusion structural test). LOC budget: ~700 TS → ~1,500 TS + ~400 Svelte. No protocol changes — schema additions are forward-compatible.
