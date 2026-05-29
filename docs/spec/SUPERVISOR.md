# Supervisor — Invariant-driven autonomous teacher for the Workbench

**A teacher-of-agents that takes an invariant as commission and produces a verified curriculum of skills demonstrating it.**

**Spec version:** v0.2 draft
**Status:** spec (not yet `in_tree` per STACK_PLANNING §1.1 / Finding 2 status vocabulary). v0.1 data layer is `in_tree`; v0.2 expands scope (MCP-tool awareness, devil's-advocate panel, Registrar scaffolding) before the orchestration layer ships.
**Spec date:** 2026-05-27 (v0.2 draft); 2026-05-25 (v0.1 initial)
**Maintained by:** Travis Burandt
**Update policy:** Update when (a) a section's normative requirements change, (b) a deferred item is promoted into v0.x, (c) a new substrate dependency lands, or (d) the architectural invariant in §11 changes.

**Companion docs:**
- `workbench/docs/spec/README.md` — Workbench v0.2 spec (this file extends it)
- `STACK_PERIODIC_TABLE_OF_AGENT_INVARIANTS.html` — the source-of-truth invariant catalogue (~40 invariants × 10 families)
- `STACK_PLANNING.md` — forward-looking protocol/extraction backlog; this spec claims five empty seats listed in §3 + §4 of that doc
- `STACK_ARCHITECTURE_GAP_REVIEW.md` — Findings 8, 11, 12 (this spec advances all three)
- `graphonomous/docs/skills/SKILLS.md` — Graphonomous loop-phase machines (5)
- `PRISM/docs/spec/README.md` — OS-009 diagnostic engine; the supervisor's scoring backend
- `PULSE/schemas/pulse-loop-manifest.v0.1.json` — PULSE manifest schema (this spec declares the teacher loop as a PULSE loop)

---

## 0. Purpose & non-goals

### 0.1 Purpose

The Supervisor is the **second end-user surface for the [&] dark-factory loop**, after the Workbench itself. Where the Workbench teaches one skill at a time with a human in the loop, the Supervisor takes an **invariant from the Periodic Table of Agent Invariants** as commission and autonomously produces a verified **curriculum of skills** that collectively demonstrate the invariant across its manifestation space.

A teacher who is told *"go produce skills that demonstrate `gate.replay_fidelity` under every body × turn-count × redaction-profile combination, within a 2-dollar / 30-minute budget"* and returns a `CurriculumBundle` whose every skill independently passes the named gate.

### 0.2 The job-to-be-done

> *I have a property my agents must satisfy. Produce a library of skills that prove the property holds, under conditions I name, with a budget I cap. Hand me back one diffable artifact that a third party can verify without running my stack.*

The Supervisor is hired to:

1. Accept a `TeacherCharter` naming **one invariant** + **a manifestation space** + **a budget**.
2. Autonomously generate, teach, verify, and store **N SkillBundles** demonstrating the invariant.
3. Track **epistemic-frontier coverage** of the manifestation space — what's covered, what's still open.
4. Emit one **`CurriculumBundle`** wrapping every produced SkillBundle, with PRISM scores attached and the invariant's proof gate either passing or failing for each.

### 0.3 Why now (architectural)

Five empty seats in the autonomous-skill-generation space are simultaneously claimable, per `STACK_PLANNING.md` planning research (2026-05-25):

| Empty seat | How this spec claims it |
|---|---|
| **Invariant as curriculum axis** (vs task/capability) | The TeacherCharter names an invariant, not a domain. |
| **Portable `TeacherCharter` / DomainSpec format** | §2 defines it. |
| **Curriculum-level EvidenceBundle** | §3 defines `CurriculumBundle`. |
| **Teacher-agent benchmark** | A CurriculumBundle IS a teacher benchmark artifact — PRISM scores it. |
| **Epistemic-frontier coverage metric** | §6 defines Wilson-interval-over-manifestation-space coverage. |

The Voyager / SkillWeaver / FRIDAY / LearnAct / ACE family already saturate "generate task-skills in a loop." None of them index on invariants, none produce a curriculum-level artifact, and none compose with a verifier they did not build. **This spec wins by being the only formulation consistent with what's already shipped** in the [&] Stack:

- The Periodic Table already enumerates invariants
- PRISM already implements gates that ARE invariants (`gate.replay_fidelity`, `gate.no_hidden_capability`, `gate.authority`, `gate.redaction_verify`, `gate.trace_completeness`, `gate.content_hash`)
- Graphonomous already implements epistemic-frontier (Wilson intervals) and coverage scoring (`review` skill)
- Workbench already produces verified bundles
- PULSE already declares cross-loop tokens

### 0.4 The central invariant (sharpest claim)

This is the line the Supervisor exists to make true:

> **A Supervisor curriculum is not valid because the teacher LLM thinks it covered the domain. It is valid because (a) every skill in the bundle independently satisfies the invariant's proof gate, (b) a devil's-advocate agent that did not produce the skill failed to find a cheap-pass exploit, and (c) coverage of the declared manifestation space is reported with a Wilson lower bound the user can read.**

Every architectural decision in this spec serves that invariant. The supervisor never grades its own homework — the gate verdict is computed by the same processor PRISM uses on third-party submissions. The panel (lead teacher + devil's advocate + examiner) is the antibody against gate weakness: when the advocate finds a passing-but-trivial skill, that is a signal to strengthen the gate, not to veto the skill.

### 0.4.1 v0.2 scope additions (over v0.1 draft)

The v0.2 revision (2026-05-27) folds three design moves into the spec while keeping all v0.1 artifacts forward-compatible (optional fields only):

1. **Devil's-advocate panel.** The optional v0.1 critic is promoted to a default panel member (`faculty.advocate`). Advisory still — the proof gate remains authoritative. See §4.5.
2. **MCP-tool awareness.** Charters may target specific MCP servers via `mcp_targets`; trace edges gain a `tool_call` kind; a new gate (`gate.tool_contract_compliance`) verifies recorded tool calls against the server's published `inputSchema`/`outputSchema`. A new artifact, **`MCPInvariantPack`**, lets each MCP server in the [&] stack ship its own invariant catalogue and the school auto-discovers them. See §5.4, §5.5, §7.3.
3. **Registrar scaffolding.** The Supervisor runs one curriculum; the **Registrar** is the persistent layer above it that accumulates evidence across runs. v0.2 ships a write-only `CellLedger` and a read-only "prior runs for this invariant" surface; the full Registrar (InvariantLedger / TeacherLedger / AlumniLedger) is v0.3. See §8.4.

Items not in v0.2 (still deferred): multi-invariant charters, information-gain frontier routing (stratified picker lands; full Wilson-frontier is v0.3), federated curriculum aggregation, supervisor-of-supervisors, charter marketplace.

### 0.5 Non-goals (v0.1)

- **No multi-invariant charters.** One invariant per charter; multi-invariant compositions are v0.2.
- **No federated curriculum aggregation.** Curricula are produced on one machine in v0.1; FGAP (`STACK_PLANNING.md` Tier C row 18) is the future story.
- **No human-in-the-loop teach interleaving in the same run.** The Supervisor is fully autonomous within one run; mixed-mode (human takes over a turn) is v0.2.
- **No real-time leaderboard push.** CurriculumBundles export to disk; PRISM ingest endpoint when it lands.
- **No teacher-of-teachers.** A Supervisor does not commission other Supervisors in v0.1. (Possible in v0.3+ once `&teach.charter` is a first-class capability.)
- **No paid model recommender.** The TeacherCharter names its model explicitly; the Supervisor does not silently route to cheaper or more expensive models.
- **No new protocols.** v0.1 composes only what is already in-tree or live, and what Workbench v0.2 already shipped.

---

## 1. User-visible surface

### 1.1 Pages

| Route | Purpose | Persistence |
|---|---|---|
| `/supervise` | Paste a TeacherCharter (JSON) or pick a pre-built one. "Run" button. Live progress table: phase, current skill being taught, frontier remaining, budget consumed. | sessionStorage during run; IndexedDB on completion |
| `/supervise/[run_id]` | Inspect a completed SupervisorRun. Tabs: **Charter** / **Skills** / **Coverage** / **Frontier** / **Bundle export**. | IndexedDB |
| `/skills` (extended from v0.2) | List view gains a `curriculum_id` filter and a `taught_by_supervisor: true` badge. | IndexedDB |

### 1.2 Persistent surface deltas vs Workbench v0.2

- The nav gains a `Supervise` link sitting between `Teach` and `Skills`.
- The footer adds the supervisor version to the existing version string:
  `Workbench v0.3.0 · Supervisor v0.1 · [&] Protocol v0.1.0 · PULSE v0.1.1`

### 1.3 What a v0.1 Supervisor is *not* (scope guard)

A v0.1 Supervisor is explicitly **not**:

- a marketplace of charters (`/supervise` accepts pasted JSON, full stop)
- a recommendation engine for which invariant to teach next
- a CI runner (a thin CLI wrapper over the same loop is v0.2)
- a guarantee that *every* manifestation in the space can be covered with the given budget (it reports what was covered and what is frontier-remaining)
- a substitute for human curation (a human still reviews the resulting CurriculumBundle before publication)

---

## 2. The `TeacherCharter` artifact

### 2.1 Purpose

The diffable input to a Supervisor run. Sibling to `SkillManifest`, but at the *curriculum* level. Names the invariant, the manifestation space, the budget, and the rubric.

### 2.2 Schema

`workbench/docs/spec/TEACHER_CHARTER.v0.schema.json`:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": ".../TEACHER_CHARTER.v0.schema.json",
  "type": "object",
  "required": [
    "charter_id", "spec_version", "invariant_ref",
    "manifestation_space", "budget", "rubric", "model"
  ],
  "additionalProperties": false,
  "properties": {
    "charter_id":      { "type": "string", "minLength": 1 },
    "spec_version":    { "const": "0.1" },
    "name":            { "type": "string" },
    "description":     { "type": "string" },
    "invariant_ref": {
      "type": "object",
      "required": ["table_uri", "invariant_id", "family"],
      "properties": {
        "table_uri":    { "type": "string", "format": "uri" },
        "invariant_id": { "type": "string", "minLength": 1 },
        "family": {
          "enum": [
            "topological", "temporal", "governance", "spatial",
            "deliberation", "attention", "evaluation", "security",
            "embodiment", "federation", "economic"
          ]
        },
        "formal_definition": { "type": "string" },
        "proof_gate":        { "type": "string" }
      }
    },
    "manifestation_space": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["dimension", "values"],
        "properties": {
          "dimension": { "type": "string" },
          "values":    { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "budget": {
      "type": "object",
      "required": ["max_skills"],
      "properties": {
        "max_skills":         { "type": "integer", "minimum": 1 },
        "max_dollars":        { "type": "number", "minimum": 0 },
        "max_seconds":        { "type": "integer", "minimum": 1 },
        "max_tokens":         { "type": "integer", "minimum": 1 }
      }
    },
    "rubric": {
      "type": "object",
      "required": ["min_passing_gates"],
      "properties": {
        "min_passing_gates":      { "type": "integer", "minimum": 1, "maximum": 6 },
        "required_capabilities":  { "type": "array", "items": { "type": "string" } },
        "forbidden_capabilities": { "type": "array", "items": { "type": "string" } },
        "redaction_profile":      { "enum": ["none", "transcript_pii", "full"] },
        "coverage_target":        { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "body":            { "enum": ["simulator", "browser", "host"] },
    "model":           { "type": "string", "minLength": 1 },
    "critic_model":    { "type": "string", "minLength": 1, "description": "v0.2: optional. Presence enables the devil's-advocate panel slot. When absent and `faculty.advocate` is unset, the advocate inherits `model`. The advocate runs in a separate context (no shared scratchpad with the lead teacher) regardless of model identity." },
    "delegatic":       { "type": "boolean", "default": true },
    "fixture_seeds":   {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional fixture scenario IDs (from workbench/fixtures/scenarios/) that seed the initial frontier."
    },
    "faculty": {
      "type": "object",
      "description": "v0.2: optional role assignment for the 3-agent panel. When omitted, all roles inherit `model`. Roles MUST run in separate contexts even when assigned the same model — see §4.5 on anti-collusion.",
      "additionalProperties": false,
      "properties": {
        "lead":      { "type": "string", "description": "Lead teacher model. Defaults to charter.model." },
        "advocate":  { "type": "string", "description": "Devil's advocate model. Defaults to charter.critic_model or charter.model." },
        "goal_gen":  { "type": "string", "description": "Goal generator model. Defaults to charter.model. Kept separate so v0.3 can hire a cheap router." }
      }
    },
    "mcp_targets": {
      "type": "array",
      "description": "v0.2: optional list of MCP servers this charter teaches skills FOR. When set, the goal generator is given the server's tool list (discovered via tools/list) and produced skills are required to include at least one tool_call edge against a listed server. v0.2 caps maxItems at 1; multi-server charters are v0.3.",
      "minItems": 0,
      "maxItems": 1,
      "items": {
        "type": "object",
        "required": ["server_id"],
        "additionalProperties": false,
        "properties": {
          "server_id":         { "type": "string", "minLength": 1, "description": "Stable identifier — e.g. 'graphonomous', 'prism', 'delegatic'." },
          "server_version":    { "type": "string", "description": "Pinned version (e.g. '0.4'). When set, gate.tool_version_consistency enforces it across the bundle." },
          "server_fingerprint":{ "type": "string", "pattern": "^sha256:[0-9a-f]{64}$", "description": "Optional sha256 of the canonical tools/list response. When set, alumni skills can be re-verified against the exact contract." },
          "tool_subset":       { "type": "array", "items": { "type": "string" }, "description": "Optional whitelist of tool names. Empty/omitted ⇒ all discovered tools allowed." },
          "discovery":         { "enum": ["tools/list", "explicit"], "default": "tools/list" }
        }
      }
    },
    "school_ref": {
      "type": "string",
      "description": "v0.2: optional ID linking this charter to a long-lived School (the persistent institution wrapping a sequence of runs). When set, the Registrar appends this run to the school's ledgers. When unset, the run is anonymous and contributes only to its own CurriculumBundle. See §8.4."
    }
  }
}
```

### 2.3 Worked example — `replay_fidelity` charter

```json
{
  "charter_id": "charter-replay-fidelity-2026-05-25",
  "spec_version": "0.1",
  "name": "Replay determinism across bodies and redaction",
  "invariant_ref": {
    "table_uri": "https://opensentience.org/spec/periodic-table-of-agent-invariants.html#replay-determinism",
    "invariant_id": "replay_determinism",
    "family": "embodiment",
    "formal_definition": "For every edge e_i in a sealed trace with observation o_i and state_hash s_i, re-executing the trace through the recorded-observation executor produces an observation whose canonical hash equals s_i, OR the gate downgrades to 'structural' fidelity iff s_i is absent (e.g. after redaction).",
    "proof_gate": "gate.replay_fidelity"
  },
  "manifestation_space": [
    { "dimension": "body",             "values": ["simulator", "browser"] },
    { "dimension": "turn_count",       "values": ["single", "short", "long"] },
    { "dimension": "redaction_profile","values": ["none", "transcript_pii", "full"] },
    { "dimension": "state_mutation",   "values": ["pure", "side_effecting"] }
  ],
  "budget": { "max_skills": 12, "max_dollars": 1.50, "max_seconds": 900 },
  "rubric": {
    "min_passing_gates": 6,
    "required_capabilities": ["&model.text"],
    "forbidden_capabilities": ["&body.os"],
    "coverage_target": 0.7
  },
  "body": "simulator",
  "model": "anthropic/claude-haiku-4-5",
  "delegatic": true
}
```

The cartesian product of the manifestation space here is `2 × 3 × 3 × 2 = 36` cells. The budget caps the run at 12 skills, so coverage will be partial; the CurriculumBundle reports which 12 of 36 cells were visited and which 24 are frontier.

---

## 3. The `CurriculumBundle` artifact

### 3.1 Purpose

The diffable output. Sibling to `SkillBundle` and `EvidenceBundle`, but at the curriculum level. Content-hashed for citability; re-verifiable by a third party with no access to the producing machine.

### 3.2 Schema

`workbench/docs/spec/CURRICULUM_BUNDLE.v0.schema.json`:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": ".../CURRICULUM_BUNDLE.v0.schema.json",
  "type": "object",
  "required": [
    "curriculum_id", "spec_version", "charter_ref", "charter",
    "skill_bundles", "invariant_claims", "coverage", "budget_consumed",
    "sealed_at", "content_hash"
  ],
  "additionalProperties": false,
  "properties": {
    "curriculum_id":  { "type": "string" },
    "spec_version":   { "const": "0.1" },
    "charter_ref":    { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    "charter":        { "$ref": ".../TEACHER_CHARTER.v0.schema.json" },
    "skill_bundles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["content_hash", "manifestation"],
        "properties": {
          "content_hash":  { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
          "manifestation": {
            "type": "object",
            "description": "Map of manifestation_space.dimension → value chosen for this skill.",
            "additionalProperties": { "type": "string" }
          },
          "skill_slug":   { "type": "string" },
          "verdict":      { "enum": ["pass", "partial", "fail", "inconclusive"] }
        }
      }
    },
    "invariant_claims": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["skill_content_hash", "invariant_id", "gate", "passed", "evidence_ref"],
        "properties": {
          "skill_content_hash": { "type": "string" },
          "invariant_id":       { "type": "string" },
          "gate":               { "type": "string" },
          "passed":             { "type": "boolean" },
          "evidence_ref":       { "type": "string", "description": "JSON pointer into the skill bundle's proof.gates[]" }
        }
      }
    },
    "coverage": {
      "type": "object",
      "required": ["cells_total", "cells_visited", "wilson_lower_bound", "frontier_remaining"],
      "properties": {
        "cells_total":       { "type": "integer", "minimum": 1 },
        "cells_visited":     { "type": "integer", "minimum": 0 },
        "wilson_lower_bound":{ "type": "number", "minimum": 0, "maximum": 1 },
        "frontier_remaining":{
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": { "type": "string" }
          }
        }
      }
    },
    "budget_consumed": {
      "type": "object",
      "required": ["skills_produced", "wallclock_seconds"],
      "properties": {
        "skills_produced":    { "type": "integer" },
        "wallclock_seconds":  { "type": "integer" },
        "dollars_spent":      { "type": "number" },
        "tokens_consumed":    { "type": "integer" }
      }
    },
    "prism_scores": {
      "type": "object",
      "description": "Map of gate_id → aggregate pass-rate across all skill_bundles[]."
    },
    "sealed_at":     { "type": "string", "format": "date-time" },
    "supervisor_version": { "type": "string" },
    "content_hash":  { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
  }
}
```

### 3.3 Content hashing

Computed identically to `SkillBundle.content_hash`: canonicalize-then-`sha256`. The `content_hash` field itself is excluded from the canonicalization input. See `workbench/app/src/lib/hash.ts` — the same `bundleContentHash` function applies (the schema is intentionally hash-compatible).

### 3.4 Re-verification

A third party with only the `CurriculumBundle` file SHALL be able to:

1. Re-canonicalize and re-hash to confirm the `content_hash`.
2. For each `skill_bundles[i]`, re-run `verifyBundle` and confirm verdict matches `invariant_claims[i].passed`.
3. Re-compute the Wilson lower bound from `cells_visited / cells_total` and confirm `coverage.wilson_lower_bound`.

Failure of any of the three SHALL be reported as `unverifiable` and SHALL block leaderboard inclusion.

---

## 4. The Supervisor loop

### 4.1 Five PULSE phases

The Supervisor declares itself as a 5-phase PULSE loop, identical in shape to the Graphonomous and PRISM canonical loops:

| Phase | Implementation | Side effects |
|---|---|---|
| **retrieve**     | Graphonomous `retrieve(action: "context", query: <invariant_id + charter>)`. Pulls any prior CurriculumBundles for the same invariant, any prior SkillBundles tagged with the invariant. | none |
| **route**        | Frontier check. Compute `manifestation_space \ visited`. Pick the next unvisited cell that maximizes expected information gain (default: random; v0.2 uses Wilson-frontier ordering). | none |
| **act**          | `factory.run_one(goal, body, model)` — the existing per-skill teach loop (§7). Produces one SkillBundle. | new SkillBundle in IndexedDB |
| **learn**        | `verifyBundle(bundle, { useDelegatic })`. Construct `InvariantClaim`. If `gate.<charter.invariant>.verdict === 'pass'`, mark the manifestation cell as covered. Graphonomous `learn(action: "from_outcome", ...)`. | confidence update on prior nodes |
| **consolidate**  | When budget exhausted OR coverage_target reached OR frontier empty: Graphonomous `consolidate(action: "run")`, then emit `CurriculumBundle`, seal with `content_hash`, persist. | new CurriculumBundle |

### 4.2 Halting conditions

The loop halts on the FIRST of:

1. `budget_consumed.skills_produced >= charter.budget.max_skills`
2. `budget_consumed.dollars_spent >= charter.budget.max_dollars` (when set)
3. `budget_consumed.wallclock_seconds >= charter.budget.max_seconds` (when set)
4. `coverage.wilson_lower_bound >= charter.rubric.coverage_target` (when set)
5. `frontier_remaining` is empty (every manifestation cell has at least one passing skill)
6. Three consecutive failed teach attempts (defensive — prevents infinite loops on bad charters)

### 4.3 Goal generation

For each routed manifestation cell, the Supervisor synthesizes a teach goal via **one LLM call** templated as:

```
You are a curriculum designer. The invariant under test is {invariant.formal_definition}.
The current cell of the manifestation space is {cell_dimensions}.
Produce a single teach-able task description, in one paragraph, that exercises the invariant
under exactly these conditions. The task must be solvable with capabilities {required} and
must not require capabilities {forbidden}.
```

The resulting paragraph becomes the goal text fed into `factory.run_one`. Cost: ~$0.0002 per cell on Haiku, ~$0.005 on Sonnet.

### 4.4 Manifest auto-fill

The per-skill manifest (`name`, `slug`, `description`, `capabilities_required`) is derived by the auto-fill harness shipped with Workbench v0.3 (`workbench/app/src/lib/bundle/auto_manifest.ts`). The Supervisor does not add new manifest synthesis — it reuses what the Workbench already provides.

### 4.5 The 3-agent panel (v0.2: default-enabled)

Every routed cell runs through a panel of three distinct roles. In v0.1 the critic was an optional second LLM call. v0.2 **promotes the critic to a default panel member** (the devil's advocate) and frames the whole loop as a panel verdict, while preserving §0.4: **the proof gate remains authoritative.**

| Role | Job | Authoritative? |
|---|---|---|
| **Lead teacher** (`faculty.lead`) | Drives the teach loop; produces the SkillBundle | no — produces only |
| **Devil's advocate** (`faculty.advocate`) | After the bundle is sealed, attempts to expose cheap-pass / spec-gaming / trivial passes. Sees the recorded edges + the cell + the invariant's prose definition, but NOT the gate's executable predicate. Outputs `{verdict: 'consent' | 'dissent', rationale, counter_example?}`. | advisory only |
| **Examiner** (PRISM gates, deterministic) | Runs `verifyBundle(bundle, { useDelegatic })` — same processor PRISM uses on third-party submissions | **authoritative** |

Recording shape per skill (in `invariant_claims[i]`):
- `passed` ← examiner verdict (binary)
- `critic_dissent` ← `true` iff devil's advocate dissented
- `evidence_ref` ← JSON pointer into the bundle's `proof.gates[]` for the gate-of-record
- `counter_example` ← optional advocate-produced counter-example (v0.2 additive field)

**Why advocate dissent does not veto.** When the advocate dissents on a passing skill, the signal is that *the gate is too weak for this invariant on this cell* — not that the skill is invalid. The dissent is preserved in the bundle so a future gate revision (or a future PRISM scenario) can attack the same surface. This is structurally different from a self-grading LLM critic: the advocate is rewarded for finding gate-misses, not for matching the gate.

**Anti-collusion.** The three roles MUST run in separate contexts even when assigned the same underlying model. The goal generator (per §4.3) is a fourth context. Specifically:
- Goal generator sees: invariant prose + cell + tool list (when MCP-targeted). NOT the gate predicate.
- Lead teacher sees: the goal. NOT the gate predicate, NOT the advocate's prompt.
- Devil's advocate sees: the sealed bundle + invariant prose + cell + tool list. NOT the goal generator's prompt, NOT the gate predicate.
- Examiner sees: the sealed bundle only. No prose, no model output as input — gates are deterministic predicates.

This separation is what makes the §0.4 claim ("not valid because LLM says so") enforceable rather than aspirational.

### 4.6 Stratified frontier picking (replaces v0.1 uniform-random)

v0.1 picked the next cell uniformly at random. v0.2 picks via **stratified sampling** so each dimension is touched at least once before any cell is repeated:

1. Build the dimension visit count `D[dim][value] := number of attempts so far at this (dim, value) pair`.
2. Score each unvisited cell as `sum over its (dim,value) pairs of (1 / (1 + D[dim][value]))`.
3. Pick the cell with the highest score; break ties by canonical key.

Pure function, deterministic given the visit history. ~15 LOC delta vs uniform random. Information-gain (Wilson-frontier) routing remains deferred to v0.3.

---

## 5. Invariant-centered curriculum (the contribution)

### 5.1 Why invariants, not domains

A *domain* (e.g. "Python data analysis") is task-shaped and saturates fast — Voyager-class systems already produce hundreds of thousands of these. A *capability* (e.g. "&body.browser") is what a skill USES, not what it DEMONSTRATES.

An **invariant** (e.g. `replay_determinism`, `κ-respecting`, `capability-bounded`, `authority-wrapped`) is what a skill MUST SATISFY. A library indexed on invariants tells you *which properties of correct agent behavior you have evidence for*. That is a different and more valuable artifact than another pile of how-to skills.

### 5.2 Invariant catalogue

The authoritative catalogue is `STACK_PERIODIC_TABLE_OF_AGENT_INVARIANTS.html` (~40 invariants across 10 families: topological, temporal, governance, spatial, deliberation, attention, evaluation, security, embodiment, federation, plus a separately tracked economic group).

Each invariant in the table SHALL declare:
- a **formal definition** prose-and-symbol (the part a teacher can quote into a goal generator)
- a **proof gate** (PRISM gate id when one exists; else a falsifiable verifier function)
- a **family** (the periodic-table row)
- a **fundamental-or-compositional** marker (fundamentals get first-class supervisor support; compositionals are derived)

Invariants whose proof gate is already implemented in `workbench/app/src/lib/bundle/verify.ts` are v0.1-eligible. The v0.1 launch set is therefore exactly the six existing gates:

1. `gate.content_hash`
2. `gate.trace_completeness`
3. `gate.no_hidden_capability`
4. `gate.authority`
5. `gate.redaction_verify`
6. `gate.replay_fidelity`

Additional invariants (κ-respecting, scope-bounded, authority-wrapped, etc.) become v0.1-eligible the moment their verifiers ship in `bundle/verify.ts`.

### 5.3 The unfair-advantage observation

The Supervisor is the **only** existing autonomous-skill-generation system whose verifier was not built by the same team that built the curriculum loop. PRISM gates are pre-existing, shipped, audited, and used by external evaluators. Voyager grades its own homework with GPT-4; the Supervisor cannot grade its own homework even if it wanted to.

This is the structural reason the central invariant (§0.4) is enforceable here and is not enforceable in the rest of the field.

### 5.4 MCP-tool-specific gates (v0.2)

The six v0.1 gates are stack-general. v0.2 adds **tool-shaped** gates that fire only when a SkillBundle's interaction trace contains `tool_call` edges (see §7.3). They are skipped on non-MCP bundles and so are fully backward-compatible.

| Gate | Predicate | Family |
|---|---|---|
| `gate.tool_contract_compliance` | For every `tool_call` edge, the recorded `args` validates against the server's published `tools/list[*].inputSchema`; when an `outputSchema` is declared, the recorded `result` validates against it. | governance |
| `gate.tool_idempotence` | For tools declared idempotent in their MCPInvariantPack (e.g. `retrieve`, `inspect`), two `tool_call` edges with identical `args_hash` MUST have identical `result_hash`. | topological (κ) |
| `gate.tool_version_consistency` | All `tool_call` edges within one bundle reference the same `server_version`; when `charter.mcp_targets[i].server_fingerprint` is set, the bundle's recorded fingerprint MUST match. | embodiment |

`gate.tool_contract_compliance` ships in v0.2. `gate.tool_idempotence` and `gate.tool_version_consistency` ship as v0.2 or v0.2.1 once an MCPInvariantPack exists declaring idempotent tools — until then they are no-ops (pass when no idempotent tools are declared). The schema in `bundle/verify.ts` lifts `min_passing_gates` ceiling from 6 to 9 when MCP gates are active.

### 5.5 MCPInvariantPack — per-server invariant catalogues (v0.2)

Each MCP server in the [&] stack MAY ship an `mcp-invariants.v0.json` file declaring (a) the server's identity + version, (b) the invariants it claims to satisfy, (c) which tools each invariant applies to, and (d) sample charters that exercise each invariant. The Supervisor at charter-load time auto-discovers these packs across installed servers and offers them as one-click charter templates.

Schema: `workbench/docs/spec/MCP_INVARIANT_PACK.v0.schema.json` (sibling spec file).

```jsonc
{
  "spec_version": "0.1",
  "server_id":         "graphonomous",
  "server_version":    "0.4",
  "server_fingerprint":"sha256:...",
  "tools": [
    { "name": "retrieve", "idempotent": true,  "inputSchema": { ... }, "outputSchema": { ... } },
    { "name": "act",      "idempotent": false, "inputSchema": { ... } },
    { "name": "learn",    "idempotent": false, "inputSchema": { ... } },
    { "name": "consolidate", "idempotent": false, "inputSchema": { ... } },
    { "name": "route",    "idempotent": true,  "inputSchema": { ... } }
  ],
  "invariants": [
    {
      "invariant_id":      "kappa_routing_correctness",
      "family":            "topological",
      "formal_definition": "Every retrieve(action: 'context') result with topology.routing == 'deliberate' shows topology.kappa > 0.",
      "proof_gate":        "gate.tool_contract_compliance",
      "applies_to_tools":  ["retrieve"],
      "sample_charter_uri":"./charters/kappa-routing.charter.json"
    },
    {
      "invariant_id":      "consolidate_idempotence_on_steady_state",
      "family":            "topological",
      "proof_gate":        "gate.tool_idempotence",
      "applies_to_tools":  ["consolidate"]
    }
  ]
}
```

### 5.6 Why this is the dogfood story

The [&] stack already ships six MCP servers: `delegatic`, `body_browser`, `body_os`, `graphonomous`, `prism`, plus the ampersand-protocol skill bundle. Each has 3–10 tools with declared contracts. v0.2 turns the Supervisor into **the verification engine each of these servers wishes it had** — point a charter at `graphonomous@0.4`, get a `graphonomous-skill-pack-v0.4/` directory of pre-verified installable skills demonstrating its invariants. This is the first concrete artifact the school produces that a third party can install in their own Claude Code / Codex / VS Code environment.

The SKILL.md compiler (§9) gains MCP-pack-awareness: a CurriculumBundle with `mcp_targets[0]` set compiles to a packaged directory with a top-level `SKILL_PACK.md` (server identity + version + invariant coverage) and N child `SKILL.md` files.

---

## 6. Manifestation space + coverage metric

### 6.1 Manifestation space as a discrete grid

The TeacherCharter's `manifestation_space` defines an N-dimensional discrete grid. Each cell is a product of one value per dimension. The example in §2.3 has 36 cells.

### 6.2 Visit and cover

A cell is **visited** when the Supervisor produces at least one SkillBundle whose `manifestation` map equals the cell coordinates.
A cell is **covered** when at least one visiting SkillBundle has `invariant_claims[*].passed === true` for the charter's invariant.

### 6.3 Coverage metric — Wilson lower bound

`coverage.wilson_lower_bound` = Wilson score interval lower bound at 95% confidence for `(covered_cells / total_cells)`.

```
Let n = cells_total, k = cells_covered, z = 1.96 (95% CI).
phat = k / n
denom = 1 + z² / n
center = phat + z²/(2n)
margin = z * sqrt(phat*(1-phat)/n + z²/(4n²))
wilson_lower = (center - margin) / denom
```

This matches the existing Graphonomous `epistemic-frontier` skill (Wilson intervals over confidence buckets). Reusing the same statistic keeps third-party reasoning consistent across the stack.

### 6.4 Frontier reporting

`coverage.frontier_remaining` is the (un-visited ∪ visited-but-not-covered) set. Each entry is a manifestation cell. The frontier is what the next supervisor run would attack.

### 6.5 Stratified routing (v0.2); Wilson-frontier deferred to v0.3

v0.1 picked the next cell uniformly at random. **v0.2 ships stratified sampling** (§4.6) so every dimension value is touched before any repeat — closes the "school that picks lessons at random" gap. v0.3 will pick the cell whose Wilson upper bound is highest given current evidence, matching the existing epistemic-frontier semantics in Graphonomous.

---

## 7. Integration with the Workbench teach loop

### 7.1 Reused modules

The Supervisor does NOT reimplement the teach loop. It calls into the existing modules:

| Module | Used for |
|---|---|
| `app/src/lib/mcp/{delegatic, body_browser, prism}.ts` | MCP wrappers (already through same-origin proxy) |
| `app/src/lib/openrouter.ts` | LLM call |
| `app/src/lib/trace.ts` | InteractionTrace builder |
| `app/src/lib/bundle/builder.ts` | SkillBundle assembly |
| `app/src/lib/bundle/verify.ts` | 6-gate verification (Delegatic-aware) |
| `app/src/lib/storage.ts` | IndexedDB persistence |

### 7.2 New modules added by Supervisor v0.2

The v0.1 set, plus four v0.2 additions (marked ★):

| New file | Purpose |
|---|---|
| `app/src/lib/bundle/auto_manifest.ts` | Heuristic + optional LLM finalize for the skill manifest |
| `app/src/lib/factory/run_one.ts` | Pure-function single-skill teach loop |
| `app/src/lib/supervisor/charter.ts` | TeacherCharter loader + schema validator |
| `app/src/lib/supervisor/manifestation.ts` | Manifestation-space enumeration, visited/covered/frontier helpers, stratified picker (§4.6) |
| `app/src/lib/supervisor/coverage.ts` | Wilson lower bound (shared with Graphonomous epistemic-frontier) |
| `app/src/lib/supervisor/goal_gen.ts` | The one-call goal generator (MCP-aware when `charter.mcp_targets` set, §4.3) |
| `app/src/lib/supervisor/critic.ts` | Devil's-advocate panel member (§4.5). v0.1 was disabled; v0.2 is default-on. |
| `app/src/lib/supervisor/run.ts` | The 5-phase loop |
| `app/src/lib/supervisor/bundle.ts` | CurriculumBundle assembly + content_hash |
| `app/src/lib/mcp/discovery.ts` ★ | v0.2: `tools/list` against each `charter.mcp_targets[*].server_id`; result cached for goal_gen + contract gate |
| `app/src/lib/bundle/verify_mcp.ts` ★ | v0.2: `gate.tool_contract_compliance` (+ stubs for `gate.tool_idempotence`, `gate.tool_version_consistency`) |
| `app/src/lib/supervisor/mcp_pack.ts` ★ | v0.2: `MCPInvariantPack` loader + validator (§5.5) |
| `app/src/lib/supervisor/cell_ledger.ts` ★ | v0.2: write-only IDB ledger of per-cell attempts (Registrar scaffolding, §8.4) |
| `app/src/routes/supervise/+page.svelte` | Paste-charter UI + live run table |
| `app/src/routes/supervise/[run_id]/+page.svelte` | Completed-run inspector |

Total estimated source weight: ~1,500 lines of TypeScript, ~400 lines of Svelte (v0.2). Well under the 25KB-gzipped reference-impl bar from `STACK_PLANNING.md` §1.

### 7.3 `tool_call` trace edge kind (v0.2)

`InteractionTrace.edges[]` currently supports `kind: 'turn' | 'authorize' | 'observe'`. v0.2 adds a fourth, fully backward-compatible:

```ts
type EdgeKind = 'turn' | 'authorize' | 'observe' | 'tool_call';

interface ToolCallEdge {
  kind: 'tool_call';
  index: number;
  ts: string;
  capability: `mcp.${string}.${string}`;   // e.g. "mcp.graphonomous.retrieve"
  tool_id: string;                          // "<server_id>.<tool_name>"
  server_version: string;                   // from server's serverInfo
  args_hash: string;                        // sha256(canonical(args))
  result_hash: string;                      // sha256(canonical(result))
  observation?: unknown;                    // retained for backward compat
}
```

The existing six gates ignore `tool_call` edges (they continue to operate on the union of all edges as before — `kind` is opaque to them). The three new MCP gates (§5.4) operate **only** on `tool_call` edges.

**Capability decomposition.** v0.1 capabilities are family-level (`&body.browser`). v0.2 introduces tool-level identifiers under the `mcp.` prefix: `mcp.body-browser.navigate`, `mcp.graphonomous.retrieve`. The family-level capabilities remain valid; tool-level capabilities decompose to a family for legacy gates (`gate.no_hidden_capability` walks the prefix tree). Schema-compatible because capability strings are free-form.

**Trace builder responsibility.** The Workbench MCP wrappers (`lib/mcp/{graphonomous,prism,delegatic,body_browser,body_os}.ts`) MUST be updated to emit `tool_call` edges via `appendEdge` instead of inlining their effects under a `turn` edge. This is a thin per-wrapper change (~10 LOC each); the existing teach page works unchanged because `kind` is purely additive.

---

## 8. Integration with Graphonomous + PRISM

### 8.1 Graphonomous (memory)

The Supervisor uses Graphonomous as its **persistent memory across runs**:

- Each produced SkillBundle is stored as a **procedural node** with edges to:
  - the invariant node (`semantic`)
  - the charter node (`procedural`)
  - the manifestation cell (`spatial` once SCOPE lands; until then, attribute-encoded)
- Coverage decisions consult prior runs via `retrieve(action: "context")`.
- `learn(action: "from_outcome")` after each teach updates confidence on the invariant node and on related procedural nodes (e.g. "the auto-manifest module produced a valid manifest 9/10 times for this charter family").

### 8.2 PRISM (diagnostic)

PRISM scores the curriculum:

- Each CurriculumBundle is a **PRISM EvidenceBundle for a teacher** — analogous to the existing per-skill EvidenceBundle.
- PRISM `compose(action: "scenario_set")` can ingest a CurriculumBundle's skill list as a scenario sequence.
- PRISM `observe` rejudges each skill (independent second opinion).
- PRISM `diagnose(action: "leaderboard")` can rank Supervisor runs by `coverage.wilson_lower_bound` per invariant.

This composition is gated on PRISM shipping a `tools/call ingest_curriculum_bundle` endpoint. Until then, the Supervisor produces the bundle and the user uploads manually via the `/prism` page's existing copy-bundle-JSON button.

### 8.3 PULSE (temporal)

A `supervisor.pulse.json` manifest declares the loop:

```json
{
  "spec_version": "0.1.1",
  "loop_id": "supervisor.v1",
  "phases": [
    { "id": "retrieve",    "kind": "retrieve",    "calls": "graphonomous.retrieve" },
    { "id": "route",       "kind": "route",       "calls": "supervisor.frontier" },
    { "id": "act",         "kind": "act",         "calls": "workbench.factory.run_one" },
    { "id": "learn",       "kind": "learn",       "calls": "workbench.verifyBundle + graphonomous.learn" },
    { "id": "consolidate", "kind": "consolidate", "calls": "graphonomous.consolidate + supervisor.seal" }
  ],
  "cadence":   { "trigger": "user", "horizon": "per_run" },
  "substrates":["workbench:0.3", "graphonomous:0.4", "prism:0.1", "delegatic:0.1", "body_browser:0.1"],
  "invariants":[ "coverage.wilson_lower_bound" ],
  "emits": [
    "workbench.v1.SkillCrystallized",
    "supervisor.v1.CurriculumSealed",
    "supervisor.v1.FrontierReported"
  ],
  "consumes": [
    "workbench.v1.SkillCrystallized",
    "prism.v1.SkillScored"
  ]
}
```

The vendor-namespaced tokens (`supervisor.v1.*`) require PULSE v0.1.2 (vendor-namespace mechanism — `STACK_PLANNING.md` §6.7). Until PULSE v0.1.2 ships, the manifest is descriptive-only and the tokens are not normatively registered.

### 8.4 The Registrar layer — what wraps a Supervisor run (v0.2 scaffolding, v0.3 first-class)

**The Supervisor runs one curriculum. The Registrar is the persistent institution wrapping a sequence of curricula across time.** Without this layer the school is a one-shot teacher; with it, the school *remembers being a school*.

v0.2 ships **scaffolding only** — enough to start populating data, not yet a UI:

| Ledger | Shape | v0.2 status |
|---|---|---|
| `CellLedger` | append-only IDB store: `(timestamp, charter_id, cell_key, model, panel_verdict)` per attempt | **write-only in v0.2.** Consumed by v0.3's cell-difficulty picker. |
| `InvariantLedger` | per `invariant_id` aggregate: school-wide Wilson trajectory, school-wide frontier (cells never-covered across any curriculum), running gate-strength evidence (advocate dissents that found cheap-passes) | v0.3 |
| `TeacherLedger` | per `(model, prompt_template)` report card: charters taught, dollars-per-passing-skill, specialty (which invariant families it's best at) | v0.3 |
| `AlumniLedger` | every produced SkillBundle by `content_hash`, with `last_reverified_at`, `staleness` indicator, and the `server_fingerprint` it was sealed against | v0.3 |

v0.2 surface delta on `/supervise`: when `charter.school_ref` is set, a panel reads from `CellLedger` and surfaces *"prior runs in this school have visited K of N cells of this invariant — frontier remaining: ..."* The user can choose to seed the frontier with the school's unvisited cells or start fresh.

**Why scaffolding without UI now.** Two of the v0.2 features benefit from CellLedger writes immediately even before the read-side exists: (a) v0.3's cell-difficulty picker needs historical attempt data to train on, (b) regression detection (catastrophic forgetting) needs the prior pass/fail data to compare against. The write-side is ~40 LOC; deferring it would cost a year of v0.3-ready data.

**Why not v0.2 first-class.** Building the full Registrar (4 ledgers + dashboard + consolidation phase) is its own PR, comparable in size to the Supervisor itself. Keeping it as scaffolding in v0.2 protects the v0.2 ship date without losing the future.

### 8.5 What the "school" earns by having a Registrar

| School concept | Without Registrar (v0.1) | With Registrar (v0.3) |
|---|---|---|
| Principal's office | one-page run inspector | `/school` dashboard: invariant × model × time |
| Report card | none | per-(model, prompt) across all charters |
| Standardized test | each charter's own holdout | school-wide invariant battery |
| Alumni network | sealed bundles in IDB | re-verifiable registry with staleness |
| Faculty roster | `charter.model` (string) | hire/retire history + per-family specialty |
| Lesson plans | `fixture_seeds` (sparse) | successful (invariant × cell × prompt) tuples |
| Faculty meeting | none | periodic cross-charter consolidation |
| Substitute teacher | "halt after 3 failures" | fallback model on primary outage |

These rows are why "Supervisor v0.1" is *correctly* named a Supervisor, not a School. The School is what v0.3 ships.

---

## 9. SKILL.md compiler (Anthropic ecosystem bridge)

### 9.1 Purpose

Each SkillBundle in a CurriculumBundle can be compiled to an **Anthropic Agent Skill** (`SKILL.md` + YAML frontmatter + optional scripts/templates). This makes the produced skills installable into Claude Code, Codex, VS Code, GitHub Copilot and any other agentskills.io-compliant host.

### 9.2 Mapping

```
SkillBundle                          →  SKILL.md
─────────────────────────────────────────────────────────────
manifest.name                        →  frontmatter: name
manifest.slug                        →  frontmatter: id
manifest.description                 →  frontmatter: description
manifest.capabilities_required       →  frontmatter: capabilities
manifest.version                     →  frontmatter: version
proof.overall_verdict                →  frontmatter: verified (true iff "pass")
proof.gates[]                        →  frontmatter: proof_gates[]
content_hash                         →  frontmatter: content_hash
interaction_trace                    →  body: ## Teach trace (collapsed)
proof.authority_result.authorization_blocks  →  frontmatter: authority_token (when present)
```

### 9.3 What this unlocks

The Supervisor produces verified curricula → compiles to SKILL.md → uploadable to Anthropic Skill marketplace + NVIDIA Verified Skills registry + agentskills.io. The Workbench's distinguishing feature in that crowded ecosystem is the proof gates that travel with each skill. That is differentiation downstream parties can read.

### 9.4 Cardinality

- One SkillBundle → one SKILL.md
- One CurriculumBundle WITHOUT `mcp_targets` → one directory of N SKILL.md files + a `CURRICULUM.md` index
- One CurriculumBundle WITH `mcp_targets[0]` set → one **MCP skill pack** directory:
  - `<server_id>-skill-pack-v<server_version>/`
    - `SKILL_PACK.md` — top-level manifest with server identity, fingerprint, invariant coverage, install instructions
    - `SKILL.md` files — one per produced skill, each declaring `mcp.<server_id>.<tool>` capabilities
    - `INVARIANT_PACK.json` — copy of the MCPInvariantPack the curriculum was authored against, for re-verifiability

The CLI helper `npx tsx scripts/compile_skill_md.ts <bundle-or-curriculum> <out-dir>` ships in v0.2. The pack form is what makes the dogfood story concrete — each [&] MCP server gets a verified, installable skill library that travels with the server.

---

## 10. Architectural invariant — what the Supervisor makes true

From `STACK_PLANNING.md` §9:

> **Every consequential agent action is authorized by a principal-bound grant, bounded by a scope, emitted as an observable event, wrapped in provenance, stored with evidence, replayable under policy, and benchmarkable by PRISM.**

The Supervisor extends this to the curriculum level:

> **Every consequential agent CURRICULUM is commissioned by a principal-bound TeacherCharter, bounded by a manifestation space, emitted as an observable PULSE loop, wrapped in CurriculumBundle provenance, stored with per-skill evidence, replayable under policy, and benchmarkable by PRISM at both the skill and curriculum levels.**

The supervisor is the principal. The charter is the scope. The CurriculumBundle is the evidence. PRISM scores both layers.

This is the first surface in the [&] Stack where the architectural invariant holds at TWO loop levels simultaneously — once for the agent-loop inside each SkillBundle, once for the teacher-loop wrapping the curriculum.

---

## 11. Acceptance criteria (v0.2)

| # | Criterion | Measured by | Origin |
|---|---|---|---|
| 1 | A valid TeacherCharter JSON validates against `TEACHER_CHARTER.v0.schema.json` | vitest | v0.1 |
| 2 | An invalid TeacherCharter (missing required field) fails validation with a clear error | vitest | v0.1 |
| 3 | The 5-phase loop runs end-to-end against the `replay_fidelity` charter (§2.3) and produces a CurriculumBundle | e2e preview test | v0.1 |
| 4 | The resulting CurriculumBundle's `content_hash` re-computes byte-for-byte after round-trip through `JSON.parse(JSON.stringify(...))` | vitest | v0.1 |
| 5 | A third party (mocked: a fresh vitest worker with no IndexedDB) can re-verify a CurriculumBundle from the JSON alone | vitest | v0.1 |
| 6 | Coverage Wilson lower bound matches a hand-computed value within 1e-6 (cells_covered dedup'd by canonical key) | vitest | v0.1 |
| 7 | Budget enforcement halts the loop before exceeding `max_skills` / `max_dollars` / `max_seconds` | vitest | v0.1 |
| 8 | The `/supervise` route shows live phase progress during a run (each phase transition reflected in the DOM within 500ms) | preview-tool test | v0.1 |
| 9 | A produced SkillBundle, when compiled to SKILL.md, validates against the agentskills.io frontmatter schema | vitest | v0.1 |
| 10 | Devil's-advocate dissent appears on the CurriculumBundle as `critic_dissent` + `counter_example`, and a holdout test confirms it CANNOT flip the examiner's verdict | vitest | v0.1 + v0.2 |
| 11 | Stratified picker visits every dimension-value at least once before any cell repeat (given budget ≥ Σ dim sizes) | vitest | **v0.2** |
| 12 | A charter with `mcp_targets[0] = graphonomous@0.4` discovers tools via `tools/list`, produces a SkillBundle containing ≥1 `tool_call` edge for a listed tool, and the bundle passes `gate.tool_contract_compliance` | preview-tool test | **v0.2** |
| 13 | A valid `MCPInvariantPack` JSON validates against `MCP_INVARIANT_PACK.v0.schema.json`; the loader surfaces it on `/supervise` as a clickable charter template | vitest | **v0.2** |
| 14 | All-gate claims: every produced SkillBundle records `invariant_claims[]` entries for ALL six v0.1 gates (not just the charter's invariant), at no additional LLM cost | vitest | **v0.2** |
| 15 | `CellLedger` append: every panel verdict writes one row to the IDB store; rows survive page reload | vitest + preview | **v0.2** |
| 16 | Anti-collusion: the goal generator, lead teacher, devil's advocate, and examiner each operate on disjoint context slices (verified by a structural test that intercepts the prompts) | vitest | **v0.2** |

A v0.2 ship requires 16/16 green. v0.1 items 1–10 are already green or are the v0.1 build prompt's deliverable; v0.2 items 11–16 are this revision's net-new deliverable.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Goal generator produces task descriptions that don't actually exercise the invariant** | The gate either passes or fails the resulting skill — false positives are bounded by the gate's correctness, not by the goal generator's. |
| **The teach loop fails (model error, MCP unreachable, OpenRouter quota)** | Per §4.2.6, three consecutive failures halt the run; partial CurriculumBundle is still emitted with `budget_consumed` reflecting reality. |
| **Manifestation-space explosion** (combinatorial blow-up on dimensions) | Schema enforces `max_skills` cap; documentation warns users to keep dimensions ≤ ~4 and values per dimension ≤ ~5. |
| **Critic disagrees with gate** | Recorded as `critic_dissent` flag, surfaced in the bundle, but gate is authoritative. Repeated dissent on a charter is a signal to revise the charter or the gate verifier. |
| **Producing low-quality skills "to pad coverage"** | The gate verdict is binary; skills that pass the gate but are useless are still flagged by Graphonomous `consolidate(action: "run")` as low-novelty / low-utility. v0.2 adds a `min_skill_novelty` rubric. |
| **Token cost overruns** | `max_dollars` is a hard halt. The TeacherCharter records the model, so cost is predictable per-skill within a factor of 2. |

---

## 13. Deferred to v0.3+

- **Full Registrar layer.** InvariantLedger / TeacherLedger / AlumniLedger + `/school` dashboard + cross-charter consolidation phase. v0.2 ships CellLedger scaffolding only.
- **Cell-difficulty-aware picker.** Uses CellLedger history; v0.2 ships stratified-sampling baseline.
- **Information-gain (Wilson-upper-bound) frontier routing.** Deferred behind stratified.
- **Spaced repetition / alumni re-verification.** Nightly sample of past CurriculumBundles re-verified against current gates; staleness surfaced.
- **Multi-invariant charters.** One supervisor commissioned with N invariants and a combined coverage metric.
- **Multi-server MCP charters.** v0.2 caps `mcp_targets` at maxItems=1; v0.3 lifts to N with cross-server invariant composition.
- **`gate.tool_idempotence` + `gate.tool_version_consistency`** wired against declared MCPInvariantPacks. v0.2 ships predicates only (no-op when no pack is loaded).
- **Ensemble verdicts.** Run the same cell with N teachers; report ensemble pass-rate as a coverage-quality signal.
- **Co-authored charters.** LLM principal reads InvariantLedger and proposes next charter to the human.
- **Apprenticeship loop.** Cheap junior teacher attempts cell first; senior teacher gets junior's trace as context on failure.
- **CLI runner** (`npx workbench-supervise charter.json` for CI use).
- **Federated curriculum aggregation** (multiple supervisors converge on a shared invariant frontier — gated on FGAP).
- **Supervisor-of-supervisors** (a meta-charter that selects which invariants to teach next based on portfolio coverage gaps).
- **Live PRISM ingest** (gated on PRISM shipping a curriculum-bundle ingest endpoint).
- **Real-time leaderboard.**
- **Charter marketplace** (FleetPrompt integration).
- **Mixed-mode runs** (human takes over a turn).
- **The other ~34 invariants from the Periodic Table** beyond the v0.2 gates — gated on their verifiers landing in `bundle/verify.ts`.

---

## 14. Open questions (decide before v0.2 ships)

Resolved in v0.2:
- ~~**Critic model.**~~ Resolved: `critic_model` field added in v0.1 schema; v0.2 makes the advocate default-on with `critic_model` (or `faculty.advocate`) defaulting to `model`.
- ~~**Goal-generator non-determinism.**~~ Resolved: yes-seeded. Per-cell seed = `hash(charter.rng_seed || cell_key)`.

Open:
1. **Charter signing.** Should the TeacherCharter carry a Delegatic AuthorizationBlock to bind it to a principal? Matches §10 architectural invariant; ~30 LOC. **Recommendation: yes, ship in v0.2.**
2. **CurriculumBundle inclusion: full skill bundles or refs only?** Refs keep the bundle small and citable; full bundles make it self-contained. **Recommendation: refs + `npx workbench-bundle-collect` helper.**
3. **Manifestation cells the user explicitly excludes.** Should the schema support an `exclude` array (cells the user wants the supervisor to skip)? **Recommendation: yes, additive `manifestation_excludes: ManifestationCell[]` — keeps the bundle honest about intentionally-not-covered vs frontier-remaining.**
4. **MCP server identity stability.** `(server_id, server_version)` is unstable across forks. Should `server_fingerprint` (sha256 of `tools/list`) be REQUIRED in v0.2 charters with `mcp_targets`, or optional? **Recommendation: optional in v0.2, required in v0.3 once the discovery flow auto-populates it.**
5. **All-gate claims size.** Recording all six gates per skill in `invariant_claims[]` multiplies the array length by 6. On a 30-skill curriculum that's 180 entries. Is the bytes-on-disk cost acceptable? **Recommendation: yes, but compress evidence_ref to JSON-pointer fragments only (no inlined gate payload).**

---

## 15. Update log

- **2026-05-25** — v0.1 initial draft. Synthesized from `STACK_PLANNING.md` (five empty seats), `STACK_PERIODIC_TABLE_OF_AGENT_INVARIANTS.html` (invariant catalogue), `workbench/docs/spec/README.md` (extends the v0.2 spec), and external research on Voyager / SkillWeaver / FRIDAY / LearnAct / ACE / Anthropic Agent Skills / NVIDIA Verified Skills / agentskills.io / Tool-R0 (curriculum at frontier) / PropertyGPT (LLM-driven property generation). Names the five empty seats this spec claims simultaneously.
- **2026-05-27** — v0.2 draft. Three design additions folded in *before* the orchestration layer ships, all forward-compatible with v0.1 artifacts:
  1. **Devil's-advocate panel** (§4.5). The v0.1 critic was optional and disabled-by-default; v0.2 promotes it to a default panel member with structurally separate context from the lead teacher and the goal generator. Anti-collusion rules made explicit.
  2. **MCP-tool awareness** (§5.4, §5.5, §7.3). New `mcp_targets` field on charter; new `tool_call` trace edge kind; new `gate.tool_contract_compliance` gate; new sibling artifact `MCPInvariantPack` so each MCP server in the [&] stack can ship its own invariant catalogue. Dogfood story: per-server verified skill packs (`graphonomous-skill-pack-v0.4/`, etc.) installable in Claude Code / Codex / VS Code.
  3. **Registrar scaffolding** (§8.4). The Supervisor runs one curriculum; the Registrar wraps a sequence of them. v0.2 ships write-only CellLedger so v0.3's cell-difficulty picker has training data on day one. The full Registrar (4 ledgers + dashboard + consolidation phase) is v0.3.
  Acceptance criteria expanded from 10 to 16. Schema additions are optional fields only — no v0.1 artifact loses validity.
