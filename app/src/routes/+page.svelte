<script lang="ts">
  import { onMount } from 'svelte';
  import { getOpenRouterKey, setOpenRouterKey, clearOpenRouterKey } from '$lib/storage';
  import { validateKey } from '$lib/openrouter';

  let key = '';
  let hasKey = false;
  let validating = false;
  let validation: { ok: boolean; ts: string } | null = null;

  onMount(() => {
    hasKey = !!getOpenRouterKey();
  });

  async function save() {
    if (!key.trim()) return;
    setOpenRouterKey(key.trim());
    hasKey = true;
    key = '';
    validation = null;
  }
  function clear() {
    clearOpenRouterKey();
    hasKey = false;
    validation = null;
  }
  async function check() {
    validating = true;
    const ok = await validateKey();
    validation = { ok, ts: new Date().toISOString() };
    validating = false;
  }
</script>

<section class="hero">
  <h1>Crystallize agent behavior into replayable skills.</h1>
  <p class="lede">
    Teach the agent once. Workbench captures every observable step, then turns the trace into a
    <strong>SkillBundle</strong> — a signed, replayable, benchmarkable record of what worked and why.
  </p>
</section>

<section class="grid">
  <article>
    <h3>1 · Teach</h3>
    <p>Open a body (browser, host, or simulator), give the agent a goal, and let it work. Every perceive / act / observe edge is recorded.</p>
    <a href="/teach">Start teaching →</a>
  </article>
  <article>
    <h3>2 · Crystallize</h3>
    <p>Promote a trace to a skill: declare inputs, capabilities, and binding. Workbench computes a content hash and seals it as a SkillBundle.</p>
  </article>
  <article>
    <h3>3 · Replay</h3>
    <p>Re-execute the skill against the same body. Workbench reports fidelity, surprises, and a verdict across six proof gates.</p>
    <a href="/skills">Browse skills →</a>
  </article>
</section>

<section class="key-panel">
  <h2>Bring your own OpenRouter key</h2>
  <p class="muted">
    Keys live in <code>sessionStorage</code> only — they are flushed when this tab closes. The key is sent through a
    pass-through Cloudflare Worker at <code>/api/llm/openrouter</code> that never logs it. See spec §7.1 and §7.5.
  </p>
  {#if hasKey}
    <div class="row">
      <span class="ok">Key stored for this session.</span>
      <button on:click={check} disabled={validating}>
        {validating ? 'Checking…' : 'Validate'}
      </button>
      <button on:click={clear}>Clear</button>
    </div>
    {#if validation}
      <p class={validation.ok ? 'ok' : 'fail'}>
        {validation.ok ? 'OpenRouter accepted the key.' : 'OpenRouter rejected the key.'}
        <span class="muted"> ({validation.ts})</span>
      </p>
    {/if}
  {:else}
    <form on:submit|preventDefault={save} class="row">
      <input type="password" placeholder="sk-or-..." bind:value={key} autocomplete="off" />
      <button type="submit" disabled={!key.trim()}>Save</button>
    </form>
  {/if}
</section>

<style>
  .hero { margin-bottom: 32px; }
  .hero h1 { font-size: 28px; margin: 0 0 8px; }
  .lede { font-size: 16px; color: #c0c5ce; max-width: 720px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .grid article { border: 1px solid #2e3440; border-radius: 6px; padding: 16px; background: #11141a; }
  .grid h3 { margin: 0 0 6px; font-size: 15px; }
  .grid p { color: #b0b5be; margin: 0 0 8px; }
  .key-panel { border: 1px solid #2e3440; border-radius: 6px; padding: 18px; background: #11141a; }
  .key-panel h2 { margin: 0 0 6px; font-size: 16px; }
  .muted { color: #6b7280; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row input { flex: 1; }
  .ok { color: #a3be8c; }
  .fail { color: #bf616a; }
</style>
