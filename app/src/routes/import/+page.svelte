<script lang="ts">
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

<h1>Import SkillBundle</h1>
<p class="muted">
  Paste a SkillBundle JSON to verify and store. Verify re-runs all six proof gates locally
  (content_hash, trace_completeness, no_hidden_capability, authority, redaction_verify, replay_fidelity).
  Bundles with overall verdict <code>fail</code> are inspected but not persisted.
</p>

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
  .muted { color: #6b7280; }
  .pass { color: #a3be8c; }
  .fail { color: #bf616a; }
  .partial, .inconclusive { color: #ebcb8b; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #2e3440; }
</style>
