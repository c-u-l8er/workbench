<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getSkill, putReplay, listBundles } from '$lib/storage';
  import { replayBundle } from '$lib/bundle/replay';
  import type { SkillManifest, ReplayReport, SkillBundle } from '$lib/types';
  import type { TraceEdge } from '$lib/trace';

  let skill: SkillManifest | undefined;
  let bundles: SkillBundle[] = [];
  let selectedBundleId = '';
  let running = false;
  let report: ReplayReport | null = null;
  let mode: 'exact' | 'structural' = 'exact';
  let loadError = '';

  $: selectedBundle = bundles.find((b) => b.bundle_id === selectedBundleId) ?? bundles[0] ?? null;

  onMount(async () => {
    const id = $page.params.id;
    skill = await getSkill(id);
    const all = await listBundles();
    bundles = all
      .filter((b) => b.skill_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (bundles[0]) selectedBundleId = bundles[0].bundle_id;
  });

  async function run() {
    if (!skill) return;
    if (!selectedBundle) {
      loadError = 'No SkillBundle found for this skill. Crystallize one first via /teach.';
      return;
    }
    running = true;
    report = null;
    loadError = '';
    try {
      report = await replayBundle({
        bundle: selectedBundle,
        mode,
        model_used: skill.validated_against?.[0]?.model ?? 'unknown',
        // Deterministic replay: each step re-emits the recorded observation
        // verbatim so the engine compares state_hashes against the trace.
        executeStep: async (edgeIndex: number) => {
          const recorded = selectedBundle.interaction_trace.edges[edgeIndex] as TraceEdge | undefined;
          return { observation: recorded?.observation };
        }
      });
      await putReplay(report);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
    }
  }
</script>

{#if !skill}
  <p>Skill not found.</p>
{:else}
  <h1>Replay: {skill.name}</h1>

  <section class="controls">
    <label>Bundle
      <select bind:value={selectedBundleId} disabled={bundles.length === 0}>
        {#each bundles as b}
          <option value={b.bundle_id}>{b.created_at} · {b.content_hash.slice(0, 14)}… ({b.proof.overall_verdict})</option>
        {/each}
        {#if bundles.length === 0}
          <option value="">— no bundles yet —</option>
        {/if}
      </select>
    </label>
    <label>Mode
      <select bind:value={mode}>
        <option value="exact">exact (state_hash must match)</option>
        <option value="structural">structural (shape only)</option>
      </select>
    </label>
    <button on:click={run} disabled={running || !selectedBundle}>{running ? 'Running…' : 'Run replay'}</button>
  </section>

  {#if loadError}
    <p class="fail">{loadError}</p>
  {/if}

  {#if report}
    <section>
      <h2>Result</h2>
      <p>
        <strong>Status:</strong> {report.status} ·
        <strong>Fidelity:</strong> {(report.fidelity * 100).toFixed(1)}% ({report.fidelity_level}) ·
        <strong>Edges:</strong> {report.edges_committed}/{report.edges_attempted}
      </p>
      {#if report.surprise_signals.length}
        <h3>Surprises</h3>
        <table>
          <thead><tr><th>Edge</th><th>Kind</th><th>Law</th><th>Family</th><th>Detail</th></tr></thead>
          <tbody>
            {#each report.surprise_signals as s}
              <tr>
                <td>{s.edge_index}</td>
                <td><code>{s.kind}</code></td>
                <td>{s.law ?? '—'}</td>
                <td>{#if s.invariant_family}<span class="fam fam-{s.invariant_family}">{s.invariant_family}</span>{:else}—{/if}</td>
                <td>{s.detail ?? ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <pre>{JSON.stringify(report, null, 2)}</pre>
    </section>
  {/if}
{/if}

<style>
  .controls { display: flex; gap: 12px; align-items: end; margin: 16px 0; }
  .controls label { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e3440; }
  .fam {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.85em;
  }
  .fam-topological { background: #2e3a4e; color: #88c0d0; }
  .fam-spatial     { background: #3a2e4e; color: #b48ead; }
  .fam-temporal    { background: #4e3a2e; color: #d08770; }
  .fam-governance  { background: #2e4e3a; color: #a3be8c; }
  .fail { color: #bf616a; }
</style>
