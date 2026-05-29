<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getSkill, listBundles, listReplaysForSkill } from '$lib/storage';
  import { applyProfile, type RedactionProfile } from '$lib/redact';
  import { bundleContentHash } from '$lib/hash';
  import type { SkillManifest, ReplayReport, SkillBundle } from '$lib/types';

  let skill: SkillManifest | undefined;
  let bundles: SkillBundle[] = [];
  let replays: ReplayReport[] = [];
  let loading = true;
  let exportProfile: RedactionProfile = 'transcript_pii';
  let downloading = false;

  onMount(async () => {
    const id = $page.params.id;
    skill = await getSkill(id);
    const all = await listBundles();
    bundles = all.filter((b) => b.skill_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    replays = await listReplaysForSkill(id);
    loading = false;
  });

  async function exportBundle(bundle: SkillBundle) {
    downloading = true;
    try {
      // Apply redaction profile, then re-stamp content_hash so the exported
      // bundle still passes gate.content_hash on the receiving end.
      const profiled = applyProfile(bundle, exportProfile);
      const sealed: SkillBundle = {
        ...profiled,
        proof: {
          ...profiled.proof,
          redaction_result: { ...profiled.proof.redaction_result, profile: exportProfile }
        },
        content_hash: ''
      };
      sealed.content_hash = await bundleContentHash(sealed as unknown as Record<string, unknown>);

      const json = JSON.stringify(sealed, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bundle.manifest.slug}.${bundle.bundle_id.slice(0, 8)}.${exportProfile}.skillbundle.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      downloading = false;
    }
  }
</script>

{#if loading}
  <p>Loading…</p>
{:else if !skill}
  <p>Skill not found.</p>
{:else}
  <h1>{skill.name}</h1>
  <p class="muted"><code>{skill.skill_id}</code> · v{skill.version}</p>
  <p>{skill.description}</p>

  <section>
    <h2>Manifest</h2>
    <pre>{JSON.stringify(skill, null, 2)}</pre>
  </section>

  {#if bundles[0]?.proof?.ia_substrate}
    {@const latest = bundles[0]}
    {@const sub = latest.proof.ia_substrate}
    <section class="ia">
      <h2>Invariant Arithmetic</h2>
      <p class="muted">
        Substrate v{sub.version} · laws
        {#each sub.laws_exercised ?? [] as l, i}{#if i > 0}, {/if}<code>{l}</code>{/each}
        · families
        {#each sub.families_exercised ?? [] as f, i}{#if i > 0}, {/if}<span class="fam fam-{f}">{f}</span>{/each}
      </p>
      <table>
        <thead><tr><th>Gate</th><th>Verdict</th><th>Law</th><th>Family</th></tr></thead>
        <tbody>
          {#each latest.proof.proof_gates ?? [] as g}
            <tr>
              <td><code>{g.id}</code></td>
              <td><span class={g.verdict}>{g.verdict}</span></td>
              <td>{g.law ?? '—'}</td>
              <td>{#if g.invariant_family}<span class="fam fam-{g.invariant_family}">{g.invariant_family}</span>{:else}—{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section>
    <h2>Bundles ({bundles.length})</h2>
    {#if bundles.length === 0}
      <p class="muted">No bundles yet. <a href="/teach">Crystallize one →</a></p>
    {:else}
      <div class="export-controls">
        <label>Redaction profile for export:
          <select bind:value={exportProfile}>
            <option value="none">none — full transcript</option>
            <option value="transcript_pii">transcript_pii — scrub sk-keys + emails</option>
            <option value="full">full — drop all observation payloads</option>
          </select>
        </label>
      </div>
      <table>
        <thead><tr><th>Created</th><th>Verdict</th><th>Content hash</th><th></th></tr></thead>
        <tbody>
          {#each bundles as b}
            <tr>
              <td>{b.created_at}</td>
              <td><span class={b.proof.overall_verdict}>{b.proof.overall_verdict}</span></td>
              <td><code>{b.content_hash.slice(0, 22)}…</code></td>
              <td><button on:click={() => exportBundle(b)} disabled={downloading}>Export JSON</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section>
    <h2>Replays</h2>
    {#if replays.length === 0}
      <p class="muted">No replays yet. <a href={`/skills/${skill.skill_id}/replay`}>Run one →</a></p>
    {:else}
      <table>
        <thead><tr><th>When</th><th>Status</th><th>Fidelity</th><th>Surprises</th></tr></thead>
        <tbody>
          {#each replays as r}
            <tr>
              <td>{r.started_at}</td>
              <td>{r.status}</td>
              <td>{(r.fidelity * 100).toFixed(1)}% ({r.fidelity_level})</td>
              <td>{r.surprise_signals.length}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p><a href={`/skills/${skill.skill_id}/replay`}>Run another →</a></p>
    {/if}
  </section>
{/if}

<style>
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #2e3440; }
  .export-controls { margin: 12px 0; }
  .export-controls label { display: block; }
  .pass { color: #a3be8c; }
  .fail { color: #bf616a; }
  .partial, .inconclusive { color: #ebcb8b; }
  .ia code { font-size: 0.9em; }
  .fam {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    margin-right: 2px;
  }
  .fam-topological { background: #2e3a4e; color: #88c0d0; }
  .fam-spatial     { background: #3a2e4e; color: #b48ead; }
  .fam-temporal    { background: #4e3a2e; color: #d08770; }
  .fam-governance  { background: #2e4e3a; color: #a3be8c; }
</style>
