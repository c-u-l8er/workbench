<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  import { putBundle } from '$lib/storage';
  import { verifyBundle } from '$lib/bundle/verify';
  import type { SkillBundle } from '$lib/types';

  let raw = '';
  let report: { overall_verdict: string; gates: { id: string; verdict: string; reason?: string }[] } | null = null;
  let error: string | null = null;
  let busy = false;

  async function importBundle() {
    busy = true;
    error = null;
    report = null;
    try {
      const bundle = JSON.parse(raw) as SkillBundle;
      if (bundle.bundle_version !== '0.1.0') {
        throw new Error(`unsupported bundle_version: ${bundle.bundle_version}`);
      }
      report = await verifyBundle(bundle);
      if (report.overall_verdict !== 'fail') {
        await putBundle(bundle);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title="Import a bundle"
  description="Load a SkillBundle produced elsewhere and re-verify it against all six proof gates. Verification is pure and offline — no network, no key."
  path="/import"
  type="WebPage"
/>

<h1>Import SkillBundle</h1>
<p class="muted">
  Paste a SkillBundle JSON to verify and store. Verify re-runs all six proof gates locally
  (content_hash, trace_completeness, no_hidden_capability, authority, redaction_verify, replay_fidelity).
  Bundles with overall verdict <code>fail</code> are inspected but not persisted.
</p>

<section class="explain">
  <h2>Why re-verification is the point</h2>
  <p>
    A SkillBundle is not trustworthy because of where it came from. It is trustworthy because
    anyone holding the file can recompute the verdict — which is what this page does. Verification
    is pure and offline: no network call, no API key, no appeal to a server that says the bundle is
    fine.
  </p>
  <dl>
    <dt>What is checked</dt>
    <dd>
      That the content hash still seals the bundle; that trace edges are contiguous and complete;
      that no capability was exercised without being declared; that every authorization present
      holds; that the declared redaction profile is idempotent on this trace; and that the trace
      replays to the same state hashes.
    </dd>
    <dt>What a failure means</dt>
    <dd>
      Each gate names its reason and the Invariant Arithmetic law it was derived from, so a
      <code>fail</code> tells you which claim broke rather than only that something did. A bundle
      that fails is still shown in full — it is just not written to the library.
    </dd>
    <dt>Where bundles come from</dt>
    <dd>
      <a href="/record">Record</a> produces them from sessions you already ran;
      <a href="/teach">Teach</a> produces them from an interaction you drive here. The format is
      identical, and so is this check.
    </dd>
  </dl>
</section>

<textarea bind:value={raw} rows="14" placeholder="Paste SkillBundle JSON here"></textarea>
<button on:click={importBundle} disabled={!raw.trim() || busy}>{busy ? 'Verifying…' : 'Verify + Import'}</button>

{#if error}
  <p class="fail">Error: {error}</p>
{/if}

{#if report}
  <section>
    <h2>Verdict: <span class={report.overall_verdict}>{report.overall_verdict}</span></h2>
    <table>
      <thead><tr><th>Gate</th><th>Verdict</th><th>Reason</th></tr></thead>
      <tbody>
        {#each report.gates as g}
          <tr>
            <td><code>{g.id}</code></td>
            <td><span class={g.verdict}>{g.verdict}</span></td>
            <td>{g.reason ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .explain { border: 1px solid #2e3440; border-radius: 6px; padding: 16px; background: #11141a; margin: 16px 0; }
  .explain h2 { margin: 0 0 8px; font-size: 15px; }
  .explain p { color: #b0b5be; font-size: 13px; margin: 0 0 10px; }
  .explain dl { margin: 0; }
  .explain dt { color: #eceff4; font-weight: 500; margin-top: 10px; font-size: 13px; }
  .explain dt:first-child { margin-top: 0; }
  .explain dd { margin: 3px 0 0; color: #b0b5be; font-size: 13px; }
  .hidden-lede { display: none; }
  .muted { color: #6b7280; }
  .pass { color: #a3be8c; }
  .fail { color: #bf616a; }
  .partial, .inconclusive { color: #ebcb8b; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #2e3440; }
</style>
