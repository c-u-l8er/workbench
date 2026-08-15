<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  // Record — turn a Claude Code session you already ran into a scored SkillBundle.
  //
  // No model is called here and no key is needed. Everything is parsed, hashed
  // and verified in this tab; nothing is uploaded. See docs/INGEST_SPIKE.md.

  import {
    ingestRecordsAsync,
    draftManifest,
    observedCapabilities,
    segmentToTrace,
    type IngestReport,
    type Segment
  } from '$lib/ingest/claude_code';
  import { fileLines } from '$lib/ingest/stream';
  import { sealBundle } from '$lib/ingest/seal';
  import { checkPhaseOrder } from '$lib/ia/phase_check';
  import { applyProfile, type RedactionProfile } from '$lib/redact';
  import { putSkill, putBundle } from '$lib/storage';
  import type { Capability, ProofGate, SkillBundle, Verdict } from '$lib/types';

  const KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;

  let file: File | null = null;
  let dragging = false;
  let phase: 'idle' | 'indexing' | 'indexed' | 'building' | 'built' = 'idle';
  let progress = 0;
  let error = '';

  let index: IngestReport | null = null;
  let selected: number | null = null;

  let segment: Segment | null = null;
  let edgeKinds: Array<[string, number]> = [];
  let capabilities: Capability[] = [];
  let cycles = 0;
  let violations = 0;

  let bundle: SkillBundle | null = null;
  let gates: ProofGate[] = [];
  let overall: Verdict | null = null;
  let bundleBytes = 0;
  let secretsFound = 0;
  let secretsInArgs = 0;

  let profile: RedactionProfile = 'transcript_pii';
  let saved = '';

  function reset() {
    index = null;
    selected = null;
    segment = null;
    bundle = null;
    gates = [];
    overall = null;
    saved = '';
    error = '';
  }

  async function loadFile(f: File) {
    reset();
    file = f;
    phase = 'indexing';
    progress = 0;
    try {
      // Pass 1: index without retaining any records. A 202 MB session is
      // 75 segments; holding all of them to list their prompts is the thing
      // that does not scale.
      index = await ingestRecordsAsync(
        fileLines(f, { onProgress: (b) => (progress = b) }),
        { retainSegment: 'none' }
      );
      phase = 'indexed';
      if (index.segments.length === 0) error = 'No user prompts found — nothing to segment.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'idle';
    }
  }

  async function selectSegment(i: number) {
    if (!file) return;
    selected = i;
    phase = 'building';
    bundle = null;
    gates = [];
    overall = null;
    saved = '';
    try {
      // Pass 2: re-stream, retaining exactly this segment.
      const full = await ingestRecordsAsync(fileLines(file), { retainSegment: i });
      segment = full.segments[i];
      const trace = await segmentToTrace(segment);

      const counts: Record<string, number> = {};
      for (const e of trace.edges) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      edgeKinds = Object.entries(counts);
      capabilities = observedCapabilities(trace);

      const pc = checkPhaseOrder(trace);
      cycles = pc.cycles;
      violations = pc.violations.length;

      const sealed = await sealBundle(draftManifest(segment, trace), trace);
      bundle = sealed.bundle;
      gates = sealed.gates;
      overall = sealed.overall_verdict;

      const json = JSON.stringify(sealed.bundle);
      bundleBytes = new Blob([json]).size;
      secretsFound = (json.match(KEY_RE) ?? []).length;
      secretsInArgs = sealed.bundle.interaction_trace.edges.reduce<number>((n, e) => {
        const tc = (e as { tool_call?: unknown }).tool_call;
        return n + (tc ? (JSON.stringify(tc).match(KEY_RE) ?? []).length : 0);
      }, 0);

      phase = 'built';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'indexed';
    }
  }

  async function save() {
    if (!bundle) return;
    const out = applyProfile(bundle, profile);
    await putSkill(out.manifest);
    await putBundle(out);
    saved = `Saved to the library with profile "${profile}".`;
  }

  function bytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  }

  function firstLine(s: string, n: number): string {
    const one = s.split('\n').find((l) => l.trim()) ?? '';
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  }

  function onDrop(ev: DragEvent) {
    ev.preventDefault();
    dragging = false;
    const f = ev.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  }

  function onPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) loadFile(f);
  }

  $: ranked = index ? [...index.segments].sort((a, b) => b.tool_calls - a.tool_calls) : [];
  $: unmapped = capabilities.filter((c) => c.startsWith('&host.unknown_'));
</script>

<PageHead
  title="Record a session"
  description="Drop a Claude Code session transcript and Workbench streams it, splits it at each turn you took, and turns every tool call and result into a scored, signed SkillBundle. No model call and no API key."
  path="/record"
  type="WebPage"
/>

<section class="hero">
  <h1>Record</h1>
  <p class="lede">
    Turn a Claude Code session you already ran into a signed, scored SkillBundle. No model call,
    no API key — the transcript is parsed, hashed and verified in this tab and never leaves it.
  </p>
</section>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="drop"
  class:dragging
  on:dragover|preventDefault={() => (dragging = true)}
  on:dragleave={() => (dragging = false)}
  on:drop={onDrop}
>
  <p><strong>Drop a session transcript here</strong></p>
  <p class="muted">
    <code>~/.claude/projects/&lt;project&gt;/&lt;session-id&gt;.jsonl</code>
  </p>
  <input type="file" accept=".jsonl" on:change={onPick} />
  {#if phase === 'indexing'}
    <p class="muted">Indexing… {bytes(progress)} read</p>
  {/if}
</div>

{#if error}
  <p class="fail">{error}</p>
{/if}

{#if phase === 'idle'}
  <!-- Static, so the page says something before anyone interacts — to a reader
       who just landed and to a crawler, which sees only what renders at build. -->
  <section class="panel">
    <h2>What happens when you drop a file</h2>
    <ol class="steps">
      <li>
        <strong>It streams.</strong> The file is read line by line, never loaded whole — the
        largest session measured on one machine was 202 MB, and a 556-session corpus indexes in
        about 13 seconds.
      </li>
      <li>
        <strong>It splits at your turns.</strong> One thing you asked for, plus the tool loop that
        followed it, is one candidate skill. A whole session is a day of unrelated work and would
        make a bundle nobody could replay or reuse.
      </li>
      <li>
        <strong>Every tool call becomes a trace edge</strong> carrying the capability it needed —
        <code>&amp;host.shell</code>, <code>&amp;host.fs_write</code>, <code>&amp;mcp.&lt;server&gt;</code>.
        A tool with no known mapping is recorded as <code>&amp;host.unknown_*</code> and never as
        <code>ambient</code>: "we don't know what this needs" and "this needs nothing" are
        different claims.
      </li>
      <li>
        <strong>Six gates run</strong> — content hash, trace completeness, hidden capability,
        authority, redaction, replay fidelity. Each verdict comes from an Invariant Arithmetic
        <code>consume</code> call and reports the law that produced it.
      </li>
    </ol>
  </section>

  <section class="panel">
    <h2>What it leaves out, and what never leaves</h2>
    <p class="small">
      Thinking blocks and subagent turns are dropped and <strong>counted</strong> — reasoning is not
      observable in the world and carries whatever you were working on. Unparsable lines are counted
      too. A zero and a blank look identical in a table and mean opposite things.
    </p>
    <p class="small">
      Nothing is uploaded. The transcript is parsed, hashed and verified in this tab. Before a
      bundle is saved you pick a redaction profile, and <code>transcript_pii</code> walks tool
      arguments as well as observations — a key in a shell command is the likeliest secret in a real
      session, not one in a payload.
    </p>
  </section>
{/if}

{#if index && phase !== 'idle' && phase !== 'indexing'}
  <section class="panel">
    <h2>Session {index.session_id || '(unknown)'}</h2>
    <div class="stats">
      <div><span class="n">{index.records_total}</span><span class="l">records</span></div>
      <div><span class="n">{index.segments.length}</span><span class="l">segments</span></div>
      <div><span class="n">{bytes(progress)}</span><span class="l">streamed</span></div>
    </div>

    <h3>Excluded</h3>
    <p class="muted small">
      Counted, never silent. A zero and a blank look identical in a table and mean opposite things.
    </p>
    <table class="excl">
      <tbody>
        {#each Object.entries(index.excluded) as [k, v]}
          <tr><td><code>{k}</code></td><td class="num">{v}</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Segments</h2>
    <p class="muted small">
      One user turn and the tool loop that follows it is one candidate skill. Ranked by tool calls.
    </p>
    <table>
      <thead>
        <tr><th>#</th><th>records</th><th>tools</th><th>capabilities</th><th>prompt</th><th></th></tr>
      </thead>
      <tbody>
        {#each ranked.slice(0, 25) as s}
          <tr class:sel={selected === s.index}>
            <td class="num">{s.index}</td>
            <td class="num">{s.record_count}</td>
            <td class="num">{s.tool_calls}</td>
            <td><code class="caps">{s.capabilities_seen.join(' ') || '—'}</code></td>
            <td class="prompt">{firstLine(s.prompt, 80)}</td>
            <td>
              <button on:click={() => selectSegment(s.index)} disabled={phase === 'building'}>
                {phase === 'building' && selected === s.index ? 'Building…' : 'Crystallize'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

{#if phase === 'built' && bundle && segment}
  <section class="panel">
    <h2>Segment {selected}</h2>
    <p class="prompt-full">{firstLine(segment.prompt, 220)}</p>

    <div class="stats">
      <div><span class="n">{bundle.interaction_trace.edges.length}</span><span class="l">edges</span></div>
      <div><span class="n">{cycles}</span><span class="l">cycles</span></div>
      <div><span class="n">{violations}</span><span class="l">phase violations</span></div>
      <div><span class="n">{bytes(bundleBytes)}</span><span class="l">bundle</span></div>
    </div>

    <p class="small">
      <strong>Edge kinds</strong>
      {#each edgeKinds as [k, v]}<code class="chip">{k} {v}</code>{/each}
    </p>
    <p class="small">
      <strong>Capabilities</strong>
      {#each capabilities as c}<code class="chip" class:warn={c.startsWith('&host.unknown_')}>{c}</code>{/each}
    </p>
    {#if unmapped.length}
      <p class="small warn-text">
        {unmapped.length} tool{unmapped.length === 1 ? '' : 's'} had no capability mapping. An
        unmapped tool is recorded as <code>&amp;host.unknown_*</code> and never as
        <code>ambient</code> — "we don't know what this needs" must stay distinguishable from
        "this needs nothing".
      </p>
    {/if}

    <h3>Proof gates</h3>
    <table class="gates">
      <thead>
        <tr><th>verdict</th><th>gate</th><th>law / family</th><th>reason</th></tr>
      </thead>
      <tbody>
        {#each gates as g}
          <tr>
            <td><span class="v v-{g.verdict}">{g.verdict}</span></td>
            <td><code>{g.id}</code></td>
            <td class="muted small">{g.law ?? '—'} · {g.invariant_family ?? '—'}</td>
            <td class="muted small">{g.reason ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="overall">
      Overall <span class="v v-{overall}">{overall}</span>
      <code class="hash">{bundle.content_hash}</code>
    </p>

    <h3>Before you keep it</h3>
    <p class="small">
      {#if secretsFound > 0}
        <span class="warn-text">
          {secretsFound} key-shaped string{secretsFound === 1 ? '' : 's'} in this bundle,
          {secretsInArgs} of them in tool arguments.
        </span>
      {:else}
        <span class="muted">No key-shaped strings found in this bundle.</span>
      {/if}
    </p>
    <div class="row">
      <label for="profile">Redaction profile</label>
      <select id="profile" bind:value={profile}>
        <option value="none">none — keep everything</option>
        <option value="transcript_pii">transcript_pii — strip keys and emails</option>
        <option value="full">full — drop observations and tool arguments</option>
      </select>
      <button on:click={save}>Save to library</button>
    </div>
    {#if saved}
      <p class="ok">{saved} <a href="/skills">Open the library →</a></p>
    {/if}
  </section>
{/if}

<style>
  .hero { margin-bottom: 24px; }
  .hero h1 { font-size: 28px; margin: 0 0 8px; }
  .lede { font-size: 16px; color: #c0c5ce; max-width: 760px; }

  .drop {
    border: 1px dashed #4c566a; border-radius: 8px; padding: 28px; text-align: center;
    background: #11141a; margin-bottom: 24px;
  }
  .drop.dragging { border-color: #88c0d0; background: #141922; }
  .drop p { margin: 0 0 8px; }
  .drop input { width: auto; margin-top: 8px; }

  .panel {
    border: 1px solid #2e3440; border-radius: 6px; padding: 18px;
    background: #11141a; margin-bottom: 20px;
  }
  .panel h2 { margin: 0 0 4px; font-size: 16px; }
  .panel h3 { margin: 20px 0 4px; font-size: 13px; color: #88c0d0; }

  .stats { display: flex; gap: 28px; flex-wrap: wrap; margin: 14px 0; }
  .stats .n { display: block; font-size: 22px; color: #eceff4; }
  .stats .l { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e3440; vertical-align: top; }
  th { color: #88c0d0; font-weight: 500; font-size: 12px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.sel { background: #161b24; }
  .excl td { border-bottom: none; padding: 2px 8px; }
  .prompt { color: #c0c5ce; max-width: 420px; }
  .prompt-full { color: #c0c5ce; margin: 4px 0 0; }
  .caps { font-size: 11px; color: #81a1c1; }

  .chip {
    display: inline-block; background: #1a1d23; border: 1px solid #2e3440;
    border-radius: 3px; padding: 1px 6px; margin: 0 4px 4px 0; font-size: 11px;
  }
  .chip.warn { border-color: #d08770; color: #d08770; }

  .v { display: inline-block; min-width: 62px; text-align: center; font-size: 11px;
       text-transform: uppercase; letter-spacing: .06em; padding: 2px 6px; border-radius: 3px; }
  .v-pass { background: #2b3a2b; color: #a3be8c; }
  .v-fail { background: #3a2b2b; color: #bf616a; }
  .v-partial, .v-inconclusive { background: #3a352b; color: #ebcb8b; }

  .overall { margin-top: 12px; }
  .hash { color: #6b7280; font-size: 11px; margin-left: 10px; }

  .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
  .row label { color: #6b7280; font-size: 12px; white-space: nowrap; }
  .row select { width: auto; flex: 1; max-width: 380px; }

  .steps { margin: 0; padding-left: 20px; color: #b0b5be; font-size: 13px; }
  .steps li { margin-bottom: 8px; }
  .steps strong { color: #eceff4; }
  .muted { color: #6b7280; }
  .small { font-size: 12px; }
  .ok { color: #a3be8c; }
  .fail { color: #bf616a; }
  .warn-text { color: #d08770; }
</style>
