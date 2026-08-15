<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  import { onMount } from 'svelte';
  import { listSkills } from '$lib/storage';
  import type { SkillManifest } from '$lib/types';

  let skills: SkillManifest[] = [];
  let loading = true;

  onMount(async () => {
    skills = await listSkills();
    loading = false;
  });
</script>

<PageHead
  title="Skill library"
  description="Every SkillBundle crystallized in this browser, with its manifest, declared capabilities, binding and proof verdict. Stored locally in IndexedDB."
  path="/skills"
  type="CollectionPage"
/>

<h1>Skills</h1>
<p class="lede">
  Every skill you have crystallized, stored in this browser. A skill is one user turn and the tool
  loop that followed it, sealed as a <strong>SkillBundle</strong> — the manifest describing what it
  does, the full interaction trace, and a proof result across six gates.
</p>

<!-- Rendered unconditionally, not only when the library is empty. A fresh
     visitor's IndexedDB is empty at prerender time, so a page whose entire
     content is the table would serve almost nothing to a reader or a crawler. -->
<section class="explain">
  <dl>
    <dt>Binding</dt>
    <dd>
      What the skill is tied to. A recorded transcript is <code>model_version_bound</code> — it
      describes what one specific model version did, and claiming portability would be a claim the
      data cannot support.
    </dd>
    <dt>Capabilities</dt>
    <dd>
      Every capability the trace exercised, declared up front. Withhold one and
      <code>gate.no_hidden_capability</code> and <code>gate.authority</code> both fail and name it.
    </dd>
    <dt>Body</dt>
    <dd>
      Where the skill acted — <code>host</code> for a recorded Claude Code session,
      <code>browser</code> or <code>simulator</code> for a taught one.
    </dd>
    <dt>Storage</dt>
    <dd>
      Local to this browser, in IndexedDB. Nothing is uploaded, and clearing site data clears the
      library. Export a bundle to move it.
    </dd>
  </dl>
</section>

{#if loading}
  <p>Loading…</p>
{:else if skills.length === 0}
  <p class="muted">No skills yet. <a href="/teach">Teach the agent</a> something, then crystallize the trace.</p>
{:else}
  <table>
    <thead>
      <tr><th>Name</th><th>Slug</th><th>Body</th><th>Binding</th><th>v</th><th></th></tr>
    </thead>
    <tbody>
      {#each skills as s}
        <tr>
          <td>{s.name}</td>
          <td><code>{s.slug}</code></td>
          <td>{s.body_choice}</td>
          <td>{s.binding}</td>
          <td>{s.version}</td>
          <td><a href={`/skills/${s.skill_id}`}>open</a></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .muted { color: #6b7280; }
  .lede { color: #c0c5ce; max-width: 720px; }
  .explain { border: 1px solid #2e3440; border-radius: 6px; padding: 16px; background: #11141a; margin: 16px 0; }
  .explain dl { margin: 0; }
  .explain dt { color: #eceff4; font-weight: 500; margin-top: 10px; font-size: 13px; }
  .explain dt:first-child { margin-top: 0; }
  .explain dd { margin: 3px 0 0; color: #b0b5be; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #2e3440; }
  th { color: #88c0d0; font-weight: 500; font-size: 12px; }
</style>
