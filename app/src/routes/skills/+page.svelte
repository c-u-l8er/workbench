<script lang="ts">
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

<h1>Skills</h1>
<p class="muted">Crystallized skills stored in this browser. Cleared if you clear site data.</p>

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
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #2e3440; }
  th { color: #88c0d0; font-weight: 500; font-size: 12px; }
</style>
