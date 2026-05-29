# Workbench

> Crystallize agent behavior into replayable skills.

A skill workshop and proof harness for the [&] Stack. Teach an agent once, capture every observable step, and turn the trace into a signed, replayable **SkillBundle** that PRISM can score and that any [&] body (browser / host / simulator) can re-execute.

## Why Workbench exists

The [&] Stack has eleven protocols (OS-001..OS-011), nine MCP servers, and roughly five hundred Elixir / TypeScript tests showing the parts work in isolation. What it didn't have — until now — was a *user-facing* artifact that exercises the whole pipeline and produces something a person actually wants. Workbench is that artifact.

A SkillBundle is valuable to the user (a reusable, replayable thing they can share). The same JSON is valuable to PRISM (it satisfies the EvidenceBundle contract from `STACK_ARCHITECTURE_GAP_REVIEW.md` Finding 8). Two audiences, one file.

See [`docs/spec/README.md`](docs/spec/README.md) for the authoritative spec.

## Layout

```
workbench/
├── docs/spec/                   # authoritative v0.1 spec + 6 JSON schemas
├── fixtures/scenarios/          # 5 canonical fixture scenarios
├── app/                         # SvelteKit static app (Cloudflare Pages)
│   ├── src/lib/
│   │   ├── types.ts             # TypeScript mirrors of every schema
│   │   ├── hash.ts              # canonical JSON + sha256 + bundleContentHash
│   │   ├── storage.ts           # IndexedDB + sessionStorage
│   │   ├── openrouter.ts        # BYO-key chat client (via /api/llm/openrouter)
│   │   ├── trace.ts             # InteractionTrace builder
│   │   ├── mcp/                 # streamable-HTTP MCP client + per-server wrappers
│   │   └── bundle/              # builder / verify / replay
│   └── src/routes/              # +layout, +page (landing), teach, skills, compare, prism, import
└── functions/
    ├── llm/openrouter.ts        # CF Pages Function: OpenRouter pass-through
    ├── mcp/                     # CF Pages Functions: delegatic / body-browser / prism MCP proxies
    └── prism/leaderboard.ts     # CF Pages Function: PRISM read-only leaderboard proxy
```

## Status

**v0.3.0-alpha** — Invariant Arithmetic v0.3 is wired into the verifier and
replay surface. Every proof gate's verdict is now computed by an
`InvariantArithmetic.consume(value, requirements)` call (`app/src/lib/ia/`),
and every gate carries `law` (e.g. `'L12/L14'`) and `invariant_family`
(`topological | spatial | temporal | governance`) annotations. Replay
surprise signals carry the same projection. The three relevant JSON schemas
(PROOF_RESULT, REPLAY_REPORT, EVIDENCE_BUNDLE) declare the optional
`law` / `invariant_family` / `ia_substrate` / `invariants` fields.

**v0.2.3 baseline** — authority gate supports `delegatic-mcp` HMAC/TTL
verification when enabled, `body-browser-mcp` is wired for browser-body
teach flows, and the PRISM page stages SkillBundle hand-off by `content_hash`.

Persisted bundles are now self-describing: `verifyBundle` returns an
`ia_substrate` block (version + `laws_exercised` + `families_exercised`
projected from the gates' annotations) which the teach flow stamps into
`bundle.proof.ia_substrate` before re-sealing the `content_hash`. The
compare flow leaves it ephemeral (no persistence).

113 / 113 vitest tests pass as of 2026-05-27 (95 v0.2 + 15 IA law properties
at 1000 trials each + 3 IA annotation/substrate tests). `npm run check` has 23 known
TypeScript/Svelte diagnostics inherited from v0.2.3 (no new diagnostics from
the IA work); do not present the app as typecheck-clean until those are
resolved.

| Surface             | Status              |
|---------------------|---------------------|
| JSON schemas (6)    | ✅ complete + IA-annotated |
| Fixture scenarios   | ✅ 5 / 5            |
| SvelteKit app shell | ✅ scaffolded       |
| Teach (simulator)   | ✅ end-to-end       |
| Fixture chooser     | ✅ 5 / 5 (AC #3)    |
| Crystallize bundle  | ✅ working          |
| Bundle verify       | ✅ 6 / 6 gates, IA-derived (v0.3) |
| Bundle replay       | ✅ deterministic, IA-annotated surprises (v0.3) |
| Redaction profiles  | ✅ none / transcript_pii / full |
| Compare tab (2 models)   | ✅ AC #13 (live LLM)  |
| Live manifest validation | ✅ AC #6           |
| Cross-session re-import  | ✅ AC #8           |
| Body-browser teach       | ✅ v0.2.2 (perceive + encode_state edges) |
| Delegatic authority      | ✅ v0.2.1 (put_policy → authorize → verify) |
| PRISM connectivity       | ✅ v0.2.3 (leaderboard + list_systems + bundle hand-off) |
| Invariant Arithmetic     | ✅ v0.3.0 (15 laws, 1000-trial property tests, `consume`-derived gates) |

## Develop

```bash
cd app
npm install
npm run dev    # http://localhost:5180
```

The dev server expects an OpenRouter key in `sessionStorage` (set via the landing page). For local development without a real proxy, set up a Vite middleware that forwards `/api/llm/openrouter/*` to `https://openrouter.ai/api/v1/*`, or configure Cloudflare's `wrangler pages dev` to mount `functions/`.

## Deploy

Cloudflare Pages, zero-budget tier. The static SvelteKit build lives under `app/build/`; the Pages Function under `functions/` is auto-discovered.

## Specs that matter here

- `docs/spec/README.md` — Workbench v0.1 spec (authoritative)
- `../AmpersandBoxDesign/SPEC.md` — [&] Protocol
- `../PULSE/schemas/pulse-loop-manifest.v0.1.json` — PULSE manifests
- `../PRISM/docs/` — PRISM benchmark contract
- `../STACK_ARCHITECTURE_GAP_REVIEW.md` Finding 8 — the Evidence Bundle gap this closes
