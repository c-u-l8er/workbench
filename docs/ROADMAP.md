# Workbench roadmap — recorder, loop closure, publication

**Status:** active · **Started:** 2026-08-14 · **Anchor doc:** read this before doing Workbench work
**Companions:** [`INGEST_SPIKE.md`](INGEST_SPIKE.md) (what was measured) · [`spec/README.md`](spec/README.md) (v0.1 spec)

This document survives sessions. It records what is decided, what is measured, what is open,
and what order the work goes in. Update it when a phase closes; do not re-derive it.

---

## 0. Where this came from

Workbench v0.1–0.3 produced bundles by driving a model through an in-browser chat page behind a
pasted OpenRouter key. Two things killed that shape:

1. **Subscription auth cannot be hosted.** The Claude Agent SDK's OAuth token is licensed for
   individual use; a multi-user app on it violates Anthropic's terms. So the surface that uses a
   Claude subscription must run locally, and the hosted surface must stop needing a key.
2. **The material already exists.** Claude Code writes every session to
   `~/.claude/projects/<project>/<session>.jsonl`. Nothing needed instrumenting.

v0.4.0 shipped `/record`, which ingests one dropped transcript. The browser cannot reach
`~/.claude`, so one-file-at-a-time is a ceiling, not a design.

## 1. Measured facts — do not re-derive these

Corpus survey, 2026-08-14, this machine, `src/lib/ingest/claude_code.ts` over all projects:

| | |
|---|---|
| Projects / sessions | 16 / **556** |
| Bytes | 1.68 GB |
| Segments (one user turn + its tool loop) | **2,198** |
| Segments with ≥1 tool call | **1,802** |
| Tool calls | **50,561** |
| Full cold index pass | **13.4 s** |
| Sessions containing key-shaped strings | 36 (**6%**, and this is a floor — the redactor is two regexes) |
| Largest single session | 202 MB / 10,040 records / 75 segments |

Capability distribution across all segments: `&host.shell` 1527 · `&host.fs_read` 1284 ·
`&host.fs_write` 1126 · `ambient` 659 · `&mcp.claude_preview` 183 · `&mcp.claude_browser` 125 ·
`&agent.spawn` 70 · `&net.http` 43.

**Gate signal is real**: every segment seals twice — honest manifest (6/6 pass) and one
capability withheld (`gate.no_hidden_capability` + `gate.authority` both fail, naming it).

## 2. The corrected picture — two things a future session must not re-discover

**(a) The deployed site is a 1,667-byte empty shell.** Every route. 0 extractable words, no
`<title>`, no JSON-LD, no internal links in HTML. SvelteKit runs `adapter-static` with
`fallback: 'index.html'` and **no page sets `prerender = true`**, so nothing is server-rendered.

alkeyword has already crawled it: `alkeyword.com/prototype/runs/workbench.opensentience.org.json`
records **0 claims**, and flags the surface under `spa_pages` and `pages_without_schema`. This is
the same failure as the docs-atlas headline finding (458,382 words → 6 extractable). The fix
pattern is owned: `docs/prerender.mjs`.

**(b) Deploys work.** Cloudflare Pages is git-connected to `c-u-l8er/workbench`; pushing `main`
builds and deploys. A 2026-08-11 session concluded the build was broken — **that was wrong**. The
check grepped served HTML for hero copy that never appears in HTML for any version; the string it
matched was a stale `<meta name="description">` in `src/app.html`. Verify a deploy by checking the
route table in the served entry bundle, never by grepping HTML for page copy:

```bash
app=$(curl -s https://workbench.opensentience.org/ | grep -oE '/_app/immutable/entry/app\.[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://workbench.opensentience.org$app" | grep -oE '"/[a-z]+"' | sort -u
```

## 3. Phases

Ordered so each one is verifiable alone and nothing depends on an unbuilt thing.

### Phase 0 — capability map completeness · ✅ **done 2026-08-14**

The survey found four real tools with no mapping, recorded as `&host.unknown_*`: `SendUserFile`
(91), `AskUserQuestion` (75), `Monitor` (18), `SendMessage` (11). Fixed before a watcher mints
bundles at scale, or 1,800 bundles would carry a wrong-ish capability.

Mapped to `&user.notify`, `&user.prompt`, `&agent.message`, `&host.watch` — **none to `ambient`**:
three reach the operator, one watches over time.

**Gate met:** a re-survey of all 556 sessions shows no `&host.unknown_*` in the top 20
capabilities, and `claude_code.test.ts` asserts each new mapping plus `!== 'ambient'`.

### Phase 1 — make the surface readable · ✅ **built 2026-08-14, deploy verification open**

`src/routes/+layout.ts` sets `prerender = true`; `skills/[id]/+layout.ts` opts back out.
Per-route head via `$lib/PageHead.svelte` (title, description, canonical, JSON-LD matching
`docs/prerender.mjs`'s shape). The hardcoded description in `src/app.html` is gone.

**Gate met** — `npm run check:prerender` after a build:

| route | words | canonical | JSON-LD |
|---|---:|---|---|
| index.html | 384 | yes | SoftwareApplication |
| record.html | 325 | yes | WebPage |
| compare.html | 269 | yes | WebPage |
| import.html | 243 | yes | WebPage |
| teach.html | 205 | yes | WebPage |
| skills.html | 159 | yes | CollectionPage |
| prism.html | 109 | yes | WebPage |

Was **0 words, no title, no JSON-LD** on every route. `tools/check-prerender.mjs` uses the same
extraction alkeyword's `crawl.py` does, so the gate and the crawler agree by construction.

**Three traps this hit, recorded so they are not re-hit:**

1. `fallback: 'index.html'` makes adapter-static **silently overwrite the prerendered homepage**
   with an empty shell — a build-log notice, not an error. The fallback is now `fallback.html`
   with `static/_redirects` routing `/skills/*` to it at 200.
2. Prerendering finally ran the link crawler and caught a real **404 on `/favicon.svg`** — the
   file had never existed. Added rather than suppressed.
3. Writing literal tag names in an `app.html` comment pollutes the extracted-word measurement.
   Three pages also turned out genuinely thin (55–98 words) because they render nothing before
   you interact; each got real static content rather than a lowered threshold.

**Deployed and re-crawled, 2026-08-14** (`cd alkeyword.com/prototype && python3 crawl.py
workbench.opensentience.org`):

| | before | after |
|---|---|---|
| Pages discovered | 1 | **7** |
| Total extractable words | **0** | **1,486** |
| Claims | **0** | real claims across all types |
| SPA pages (need JS) | 1 / 1 | **0** |
| Pages without schema | 1 / 1 | **0 / 7** |
| Page forms mintable | 0 | **1** — Glossary, 5/3 definition claims |

Still refused, and correctly: Statistics 1/5 `quantity` · FAQ 0/5 `question` · Comparison 4/6 ·
How-it-works 0/1 `process` · Entity 0/3 `credential`.

**Readable is not the same as sufficient.** The surface went from invisible to crawlable, and the
refusal rule still declines to mint five of six forms because the material genuinely is not there.
Phase 6 is what supplies the missing `quantity` claims — bundle counts and gate pass-rates, each
resolving to a recomputable `content_hash`.

**Deploys take ~75 s** from `git push` to live. Verified twice this session.

### Phase 2 — `workbench watch`

Local daemon over `~/.claude/projects`. Incremental (mtime + size + tail offset). Writes to a
local library. No network. Kills the one-file-at-a-time ceiling.

**Gate:** cold pass over 556 sessions produces N bundles unattended; a new session appended to
while running is picked up without a restart; nothing leaves the machine.

### Phase 3 — `workbench stats`

Aggregate over the local library. This is the honest first version of "learning" — statistics,
not ML. Which tool sequences recur, which capability sets cluster, which segments fail which
gates, how patterns moved over time.

**Gate:** a report a person who is not the author can read and act on.

### Phase 4 — close the PULSE circuit

Two files that the spec quotes but that **do not exist**: `workbench/pulse-manifest.v0.1.json` and
`workbench/workbench.ampersand.json`. The spec'd manifest declares `"consumes": []` — Workbench
emits five token types and consumes nothing, which is exactly why nothing comes back.

```
workbench ──ConsolidationEvent──▶ graphonomous.act/learn/consolidate
graphonomous.learn ──OutcomeSignal──▶ prism.observe          (already declared)
prism.diagnose ──ReputationUpdate──▶ workbench.retrieve      (THE MISSING EDGE)
```

**Gate:** the manifest validates against `PULSE/schemas/pulse-loop-manifest.v0.1.json`, lands in
`PULSE/manifests/`, and `consumes` is non-empty.

**Constraint that must not be violated:** `ReputationUpdate` may rank retrieval. It must **never**
influence a gate verdict. `verifyBundle` is pure and offline and that is most of why it is
trustworthy; a scorer contaminated by its own downstream scores is not a scorer.

### Phase 5 — real secret scanning

Publication is gated on this, not the other way around. The current redactor is two regexes
(`sk-…`, email). A controlled study puts Gitleaks at 88% recall with hundreds of rules and entropy
as a secondary signal, TruffleHog at 52%. Shell out; do not grow the regex list.

**Gate:** a corpus pass reports a scan rate per rule class, and `full` profile output survives an
independent scanner with zero findings.

### Phase 6 — publish the aggregate

Bundle counts and gate pass-rates are `quantity` claims with units — the type alkeyword's spec
calls "the strongest measured citation lever," and the type its G5 matrix is starved of
(Statistics 7/20, FAQ 0/20, How-it-works 0/20).

**Every published quantity must resolve to a `content_hash` a reader can recompute.** See §5.

### Phase 7 — score the public commons (optional, high leverage)

[Trace Commons](https://trace-commons-web.hf.space/) and [TraceLab](https://tracelab.cs.washington.edu/)
host public, contributor-reviewed agent traces. Scoring *those* yields cross-developer aggregate
data while publishing nothing of ours. Nobody else scores traces against a stated algebra.

## 4. Decided

| Decision | Choice |
|---|---|
| Skill unit | one `user_message` + its tool loop |
| Parser purity | no `fs`/DOM in `lib/ingest/claude_code.ts` — browser and CLI share it |
| Real transcripts | read from disk, never committed; fixtures are synthetic |
| `thinking` blocks / sidechains | excluded, **counted** |
| Unmapped tools | `&host.unknown_<name>`, never `ambient` |
| Learning, v1 | statistics over the local corpus, not skill distillation |
| Aggregation | local-first; hosted multi-user is Phase 6+, after B1 |

## 5. The failure mode this project must not commit

`ACADEMY.md` §6e: *absence of evidence must remain distinguishable from evidence of absence, and
every consequential transformation must expose why it occurred.*

Two recorded violations, both by tools whose job was to enforce it:

- alkeyword v0.5.0 filed a portfolio work item asserting three docs hosts had no canonical. It
  never parsed `<link rel="canonical">` and asserted absence anyway. Retracted by name.
- A 2026-08-11 session declared the Cloudflare build broken by grepping HTML for copy that HTML
  never contains. Corrected in §2(b).

Same shape both times: **measuring a proxy and reporting it as the thing.** Piping auto-generated
Workbench numbers into alkeyword scales this risk — a wrong gate verdict becomes a published
statistic wearing a provenance link. Hence the Phase 6 rule.

## 6. Open — needs a decision, do not guess

- **Local library store:** its own SQLite/JSON, or Graphonomous nodes? Repo policy says use the
  graph; a local-only daemon says otherwise. Unresolved.
- **B1 has never been run.** `ACADEMY.md` §6 marks it runnable today: one outsider, one real task,
  recorded either way. Phases 6–7 build a multi-user surface ahead of it. That is the documented
  risk, accepted knowingly or not at all.

## 7. Reproduce

```bash
cd workbench/app && npm test
```

```bash
cd workbench/app && ./node_modules/.bin/vite-node tools/ingest-transcript.ts ~/.claude/projects/<project>/<session>.jsonl
```

```bash
cd alkeyword.com/prototype && python3 crawl.py workbench.opensentience.org
```
