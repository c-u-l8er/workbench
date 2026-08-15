<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  // PRISM connectivity + leaderboard view (v0.3.0-alpha).
  //
  // What this page does today:
  //   1. Fetches the public leaderboard JSON (`/api/prism/leaderboard` →
  //      proxied to https://prism.opensentience.org/api/leaderboard).
  //   2. Lists registered PRISM systems via `config(list_systems)` over MCP —
  //      confirms the Workbench can speak to prism-mcp end-to-end.
  //   3. For a chosen local SkillBundle, surfaces the content_hash and
  //      structural metadata that a future PRISM EvidenceBundle-ingest API
  //      will accept. Today PRISM has no such ingest endpoint, so the page
  //      is honest about the gap and offers a copy-to-clipboard for the
  //      bundle JSON.
  //
  // This closes the *connectivity* half of Finding 8. The remaining half
  // (centralised registry of EvidenceBundles by content_hash) is a PRISM-side
  // feature tracked in PRISM docs; the workbench is ready for it the moment
  // it lands.

  import { onMount } from 'svelte';
  import * as prism from '$lib/mcp/prism';
  import { listBundles } from '$lib/storage';
  import { WORKBENCH_VERSION } from '$lib/version';
  import type { SkillBundle } from '$lib/types';

  let leaderboard: prism.Leaderboard | null = null;
  let leaderboardErr = '';
  let systems: prism.PrismSystem[] | null = null;
  let systemsErr = '';
  let bundles: SkillBundle[] = [];
  let selectedBundleId = '';
  $: selectedBundle = bundles.find((b) => b.bundle_id === selectedBundleId) ?? null;
  let copied = false;

  onMount(async () => {
    try {
      leaderboard = await prism.fetchLeaderboard();
    } catch (err) {
      leaderboardErr = err instanceof Error ? err.message : String(err);
    }
    try {
      const sess = await prism.connect();
      systems = await prism.listSystems(sess);
    } catch (err) {
      systemsErr = err instanceof Error ? err.message : String(err);
    }
    try {
      bundles = await listBundles();
      if (bundles.length > 0) selectedBundleId = bundles[0].bundle_id;
    } catch {
      // listBundles never throws under normal conditions; ignore.
    }
  });

  async function copyBundleJson() {
    if (!selectedBundle) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedBundle, null, 2));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<PageHead
  title="PRISM leaderboard"
  description="Live continual-learning leaderboard from the PRISM benchmark engine, plus SkillBundle hand-off staging by content hash."
  path="/prism"
  type="WebPage"
/>

<h1>PRISM</h1>
<p class="muted">
  Live connection to <code>prism.opensentience.org/mcp</code> — Workbench v{WORKBENCH_VERSION}.
  PRISM benchmarks memory and skill systems on nine continual-learning dimensions.
  This page proves the wire works and stages the EvidenceBundle hand-off.
</p>

<section class="explain">
  <h2>What PRISM does with a bundle</h2>
  <p>
    A SkillBundle and a PRISM EvidenceBundle are the same JSON read by two audiences. To you it is
    a reusable, replayable record of something that worked. To PRISM it is a scored observation:
    one system, one scenario, one outcome, joined to every other run of that scenario.
  </p>
  <dl>
    <dt>Why the same file serves both</dt>
    <dd>
      A benchmark fed by artifacts produced only for benchmarking measures the benchmark. A bundle
      minted from work someone actually did carries the awkward cases that invented scenarios leave
      out — the retries, the wrong turns, the tools nobody planned to call.
    </dd>
    <dt>The hand-off is by content hash</dt>
    <dd>
      A bundle is identified by <code>content_hash</code>, which seals the manifest, the trace and
      the proof result together. Anyone can recompute it, so a scored run cannot quietly refer to a
      different bundle than the one that was verified.
    </dd>
    <dt>The loop this closes</dt>
    <dd>
      Graphonomous emits an <code>OutcomeSignal</code> to PRISM's observe phase; PRISM emits a
      <code>ReputationUpdate</code> from diagnose. Both tokens are declared in PULSE v0.1.1. What
      does not exist yet is the edge back into Workbench — see <code>docs/ROADMAP.md</code> Phase 4.
      When it lands it may rank retrieval and must never influence a gate verdict.
    </dd>
  </dl>
</section>

<section class="card">
  <h2>Leaderboard</h2>
  {#if leaderboardErr}
    <p class="fail">Could not load leaderboard: {leaderboardErr}</p>
  {:else if !leaderboard}
    <p class="muted">Loading…</p>
  {:else}
    <p class="muted">PRISM cycle {leaderboard.cycle} · {leaderboard.rows.length} systems</p>
    <table>
      <thead>
        <tr>
          <th>#</th><th>System</th><th>Version</th><th>Composite</th><th>Loop closure</th>
        </tr>
      </thead>
      <tbody>
        {#each leaderboard.rows as r}
          <tr>
            <td>{r.rank}</td>
            <td><code>{r.system}</code></td>
            <td><code>{r.version}</code></td>
            <td><strong>{r.composite.toFixed(3)}</strong></td>
            <td>{r.loop_closure_rate?.toFixed(2) ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="card">
  <h2>Registered systems (MCP)</h2>
  {#if systemsErr}
    <p class="fail">prism-mcp unreachable: {systemsErr}</p>
  {:else if !systems}
    <p class="muted">Connecting…</p>
  {:else if systems.length === 0}
    <p class="muted">No systems registered yet.</p>
  {:else}
    <table>
      <thead><tr><th>Name</th><th>Display</th><th>Transport</th><th>Endpoint</th></tr></thead>
      <tbody>
        {#each systems as s}
          <tr>
            <td><code>{s.name}</code></td>
            <td>{s.display_name ?? '—'}</td>
            <td><code>{s.transport}</code></td>
            <td><code>{s.mcp_endpoint}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="card">
  <h2>Hand off a SkillBundle to PRISM</h2>
  <p class="muted">
    PRISM v0.2 does not yet expose a SkillBundle ingest endpoint. The bundle's
    <code>content_hash</code> is the stable identifier a future registry will key on.
    Until then you can copy the bundle JSON below and pipe it through your
    own PRISM tooling.
  </p>
  {#if bundles.length === 0}
    <p class="muted">No local bundles yet. <a href="/record">Record a session</a> you already ran, or
      <a href="/teach">teach</a> a new one.</p>
  {:else}
    <label>Select a bundle
      <select bind:value={selectedBundleId}>
        {#each bundles as b}
          <option value={b.bundle_id}>{b.bundle_id.slice(0, 12)}… — {b.manifest.slug}</option>
        {/each}
      </select>
    </label>
    {#if selectedBundle}
      <dl>
        <dt>skill</dt><dd><code>{selectedBundle.manifest.slug}</code> v{selectedBundle.manifest.version}</dd>
        <dt>content_hash</dt><dd><code>{selectedBundle.content_hash}</code></dd>
        <dt>edges</dt><dd>{selectedBundle.interaction_trace.edges.length}</dd>
        <dt>verdict</dt><dd><span class={selectedBundle.proof.overall_verdict}>{selectedBundle.proof.overall_verdict}</span></dd>
      </dl>
      <button on:click={copyBundleJson}>{copied ? 'Copied!' : 'Copy bundle JSON'}</button>
    {/if}
  {/if}
</section>

<style>
  .explain { border: 1px solid #2e3440; border-radius: 6px; padding: 16px; background: #11141a; margin: 16px 0; }
  .explain h2 { margin: 0 0 8px; font-size: 15px; }
  .explain p { color: #b0b5be; font-size: 13px; margin: 0 0 10px; }
  .explain dl { margin: 0; }
  .explain dt { color: #eceff4; font-weight: 500; margin-top: 10px; font-size: 13px; }
  .explain dt:first-child { margin-top: 0; }
  .explain dd { margin: 3px 0 0; color: #b0b5be; font-size: 13px; }
  .muted { color: #6b7280; }
  .fail { color: #bf616a; }
  .card { margin: 16px 0; border: 1px solid #2e3440; border-radius: 6px; padding: 14px; background: #11141a; }
  .card h2 { margin: 0 0 6px; font-size: 14px; color: #88c0d0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e3440; font-size: 12px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; margin: 12px 0; font-size: 12px; }
  dt { color: #6b7280; }
  .pass { color: #a3be8c; }
  .partial, .inconclusive { color: #ebcb8b; }
</style>
