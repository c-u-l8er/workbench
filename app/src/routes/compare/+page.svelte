<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  // Compare tab — implements spec §8.3 acceptance criterion #13 and the
  // skill.model_comparison fixture (§8.4):
  //   "Same skill, two OpenRouter models, side-by-side ProofResults.
  //    Proves the external-validation path (GAP_REVIEW Gate F) and surfaces
  //    model-dependent fidelity divergence honestly."
  //
  // Architecture note: v0.1 replay is deterministic over recorded
  // observations (it doesn't re-call the LLM), so "replay against model X"
  // is a category error. Instead this tab re-DEMONSTRATES the scenario
  // against each selected model — two independent traces, two bundles,
  // two ProofResults. Both should pass; divergence shows up in the
  // assistant content and content_hash, not the gate verdicts.
  //
  // The fixture says "min_models: 2" and "if both pass at structural
  // fidelity, the fixture passes" — verified here without flattening into
  // a single composite verdict (the UI shows both proofs in full).

  import { onMount } from 'svelte';
  import { v4 as uuid } from 'uuid';
  import { getOpenRouterKey } from '$lib/storage';
  import { chat } from '$lib/openrouter';
  import { newTrace, appendEdge } from '$lib/trace';
  import { buildBundle } from '$lib/bundle/builder';
  import { verifyBundle } from '$lib/bundle/verify';
  import { FIXTURES, getFixture } from '$lib/fixtures';
  import { WORKBENCH_VERSION, SPEC_VERSION } from '$lib/version';
  import { projectPrism9, PRISM9_DIMENSIONS, type Prism9Vector } from '$lib/ia';
  import type { SkillManifest, ProofResult, ProofGate, Verdict, SkillBundle } from '$lib/types';

  let fixtureId = 'skill.basic_prompt_to_manifest';
  let modelA = 'openai/gpt-4o-mini';
  let modelB = 'anthropic/claude-haiku-4-5';
  let running = false;
  let hasKey = false;

  interface RunResult {
    model: string;
    bundle: SkillBundle;
    verdict: Verdict;
    gates: ProofGate[];
    prism9: Prism9Vector;
    assistant_text: string;
    elapsed_ms: number;
    error?: string;
  }
  let results: [RunResult | null, RunResult | null] = [null, null];

  onMount(() => {
    hasKey = !!getOpenRouterKey();
  });

  async function runOne(model: string): Promise<RunResult> {
    const f = getFixture(fixtureId);
    if (!f) throw new Error(`unknown fixture: ${fixtureId}`);

    const t0 = performance.now();
    const trace = newTrace();
    const userTurn = f.task_prompt + '\n\n' +
      f.inputs.map((i) => `${i.name}: ${JSON.stringify(i.example ?? '')}`).join('\n');
    await appendEdge(trace, { kind: 'user_message', observation: { content: userTurn } });

    const res = await chat({ model, messages: [{ role: 'user', content: userTurn }] });
    const assistantText = res.choices[0]?.message?.content ?? '';
    await appendEdge(trace, {
      kind: 'assistant_message',
      observation: { content: assistantText, model: res.model }
    });

    const now = new Date().toISOString();
    const manifest: SkillManifest = {
      schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
      skill_id: uuid(),
      name: `${f.id} via ${model}`,
      slug: `${f.id.replace(/^skill\./, '')}-${model.replace(/[\/:]/g, '-')}`,
      description: f.purpose,
      version: 1,
      derived_from_trace_id: trace.trace_id,
      body_choice: f.body_choice,
      inputs: [{ name: 'task', type: 'string', required: true }],
      outputs: [{ name: 'final_message', type: 'string' }],
      preconditions: [],
      binding: 'model_version_bound',
      validated_against: [{ model: res.model, fidelity: 1.0, level: 'exact', ts: now }],
      capabilities_required: f.capabilities_declared,
      created_at: now,
      updated_at: now
    };
    const proof: ProofResult = {
      schema: 'https://opensentience.org/spec/proof-result/v0.1',
      verifier_version: WORKBENCH_VERSION,
      computed_at: now,
      overall_verdict: 'inconclusive',
      proof_gates: [],
      invariant_results: [],
      authority_result: { decision: 'allow' },
      redaction_result: { profile: 'none' },
      replay_result: { status: 'not_run', fidelity_level: 'inconclusive' },
      conformance_check: { spec_version: SPEC_VERSION }
    };

    const bundle = await buildBundle({ manifest, trace, proof });
    const report = await verifyBundle(bundle);
    const prism9 = projectPrism9({
      gates: report.gates,
      overall_verdict: report.overall_verdict,
      surprise_count: 0
    });
    return {
      model: res.model,
      bundle,
      verdict: report.overall_verdict,
      gates: report.gates,
      prism9,
      assistant_text: assistantText,
      elapsed_ms: Math.round(performance.now() - t0)
    };
  }

  async function runCompare() {
    if (!hasKey || !modelA.trim() || !modelB.trim()) return;
    running = true;
    results = [null, null];
    // Run sequentially so failures on one model don't blow away the other's
    // result, and so an early error surfaces clearly to the user.
    for (let i = 0; i < 2; i++) {
      const model = i === 0 ? modelA : modelB;
      try {
        const r = await runOne(model);
        results[i] = r;
        results = results;
      } catch (err) {
        results[i] = {
          model,
          bundle: null as unknown as SkillBundle,
          verdict: 'inconclusive',
          gates: [],
          prism9: null as unknown as Prism9Vector,
          assistant_text: '',
          elapsed_ms: 0,
          error: err instanceof Error ? err.message : String(err)
        };
        results = results;
      }
    }
    running = false;
  }

  $: divergence = computeDivergence(results);
  function computeDivergence(rs: [RunResult | null, RunResult | null]) {
    const [a, b] = rs;
    if (!a || !b || a.error || b.error) return null;
    const gateDiffs = a.gates
      .map((ga) => {
        const gb = b.gates.find((g) => g.id === ga.id);
        if (gb && gb.verdict !== ga.verdict) return { gate: ga.id, a: ga.verdict, b: gb.verdict };
        return null;
      })
      .filter((x): x is { gate: string; a: Verdict; b: Verdict } => x !== null);
    return {
      verdicts_match: a.verdict === b.verdict,
      gate_diffs: gateDiffs,
      content_hash_match: a.bundle.content_hash === b.bundle.content_hash,
      assistant_text_match: a.assistant_text === b.assistant_text,
      prism9_weighted_total_a: a.prism9.weighted_total,
      prism9_weighted_total_b: b.prism9.weighted_total,
      prism9_weighted_total_delta: Math.abs(a.prism9.weighted_total - b.prism9.weighted_total)
    };
  }
</script>

<PageHead
  title="Compare two models on one skill"
  description="Run the same skill against two models and compare traces, fidelity and proof-gate verdicts side by side."
  path="/compare"
  type="WebPage"
/>

<h1>Compare</h1>
<p class="muted">
  Re-run a fixture scenario against two OpenRouter models and show both <code>ProofResult</code>s side-by-side.
  Implements spec §8.3 AC #13 and fixture <code>skill.model_comparison</code>. The UI never flattens divergence
  into a composite verdict (spec §8.4): you see both proofs and any disagreement.
</p>

<section class="explain">
  <h2>Why two proofs and never one number</h2>
  <p>
    Averaging two models into a single score destroys the only interesting information: where they
    disagreed. A composite verdict that reads <code>0.5</code> cannot be distinguished from two runs
    that each half-worked, and those are different findings. Both <code>ProofResult</code>s are shown
    whole.
  </p>
  <dl>
    <dt>What differing traces tell you</dt>
    <dd>
      If two models reach the same outcome by different tool sequences, the skill is closer to
      <code>portable</code>. If only one reaches it, the skill is bound to that model and the
      manifest's <code>binding</code> should say so rather than claim otherwise.
    </dd>
    <dt>What differing gates tell you</dt>
    <dd>
      A gate that passes for one model and fails for the other localizes the divergence to a named
      claim — an undeclared capability, a state hash that did not reproduce — instead of a
      difference in overall vibe.
    </dd>
    <dt>What this page needs</dt>
    <dd>
      Two live model calls, so it is one of the two surfaces that asks for an OpenRouter key.
      <a href="/record">Recording a session</a> you already ran needs no key at all.
    </dd>
  </dl>
</section>

{#if !hasKey}
  <div class="warn">
    No OpenRouter key in this session. <a href="/teach">Set one on the Teach page</a> before running a comparison,
    or <a href="/record">record a session</a> you already ran — that needs no key.
  </div>
{/if}

<section class="config">
  <label>Fixture
    <select bind:value={fixtureId}>
      {#each FIXTURES as f}
        <option value={f.id}>{f.id}</option>
      {/each}
    </select>
  </label>
  <label>Model A
    <input bind:value={modelA} />
  </label>
  <label>Model B
    <input bind:value={modelB} />
  </label>
</section>

<button on:click={runCompare} disabled={!hasKey || running || !modelA.trim() || !modelB.trim()}>
  {running ? 'Running…' : 'Run comparison'}
</button>

<section class="results">
  {#each results as r, i}
    <div class="card">
      <h2>Model {i === 0 ? 'A' : 'B'}</h2>
      {#if !r}
        <p class="muted">—</p>
      {:else if r.error}
        <p class="fail">Error: {r.error}</p>
        <p class="muted">model: <code>{r.model}</code></p>
      {:else}
        <p class="muted">
          <code>{r.model}</code> · {r.elapsed_ms} ms · content_hash <code>{r.bundle.content_hash.slice(0, 22)}…</code>
        </p>
        <h3>Verdict: <span class={r.verdict}>{r.verdict}</span></h3>
        <table>
          <thead><tr><th>Gate</th><th>Verdict</th><th>Detail</th></tr></thead>
          <tbody>
            {#each r.gates as g}
              <tr>
                <td><code>{g.id}</code></td>
                <td><span class={g.verdict}>{g.verdict}</span></td>
                <td>{g.reason ?? (g.level ? `level: ${g.level}` : '—')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <h3>PRISM-9 projection</h3>
        <p class="muted small">Weighted total over non-null dimensions: <strong>{(r.prism9.weighted_total * 100).toFixed(1)}%</strong></p>
        <table class="prism9">
          <thead><tr><th>Dimension</th><th>Score</th><th>Weight</th></tr></thead>
          <tbody>
            {#each PRISM9_DIMENSIONS as k}
              {@const score = r.prism9[k]}
              {@const weight = r.prism9.weights[k]}
              <tr>
                <td><code>{k.replace('_score', '')}</code></td>
                <td>
                  {#if score === null}
                    <span class="muted">null</span>
                  {:else}
                    <span class="bar"><span class="bar-fill" style="width: {score * 100}%"></span></span>
                    <span class="bar-val">{(score * 100).toFixed(0)}%</span>
                  {/if}
                </td>
                <td class="muted small">{(weight * 100).toFixed(0)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <h3>Assistant response</h3>
        <pre class="resp">{r.assistant_text}</pre>
      {/if}
    </div>
  {/each}
</section>

{#if divergence}
  <section class="divergence">
    <h2>Divergence report</h2>
    <ul>
      <li>Overall verdicts match: <strong class={divergence.verdicts_match ? 'pass' : 'fail'}>{divergence.verdicts_match}</strong></li>
      <li>content_hash match: <strong class={divergence.content_hash_match ? 'pass' : 'fail'}>{divergence.content_hash_match}</strong>
        <span class="muted">(expected: false — different model outputs ⇒ different state_hashes ⇒ different content_hash)</span>
      </li>
      <li>Assistant text match: <strong>{divergence.assistant_text_match}</strong></li>
      <li>PRISM-9 weighted total: A=<strong>{(divergence.prism9_weighted_total_a * 100).toFixed(1)}%</strong> ·
        B=<strong>{(divergence.prism9_weighted_total_b * 100).toFixed(1)}%</strong> ·
        Δ=<strong>{(divergence.prism9_weighted_total_delta * 100).toFixed(2)} pts</strong></li>
      <li>Gates with diverging verdicts: {divergence.gate_diffs.length === 0 ? 'none' : ''}
        {#if divergence.gate_diffs.length > 0}
          <ul>
            {#each divergence.gate_diffs as d}
              <li><code>{d.gate}</code>: A=<span class={d.a}>{d.a}</span> · B=<span class={d.b}>{d.b}</span></li>
            {/each}
          </ul>
        {/if}
      </li>
    </ul>
    <p class="muted">
      Per fixture <code>skill.model_comparison</code> pass criteria: two complete ProofResults with both passing
      at structural fidelity is sufficient. The verdicts may diverge honestly — divergence here is informational,
      not a fixture failure.
    </p>
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
  .muted { color: #6b7280; }
  .warn { border: 1px solid #bf616a; background: #2a1c1d; padding: 10px 14px; border-radius: 4px; margin: 12px 0; }
  .config { display: flex; gap: 16px; margin: 16px 0; }
  .config label { flex: 1; display: block; }
  .results { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
  .card { border: 1px solid #2e3440; border-radius: 6px; padding: 14px; background: #11141a; min-height: 80px; }
  .card h2 { margin: 0 0 6px; font-size: 14px; color: #88c0d0; }
  .card h3 { margin: 12px 0 6px; font-size: 13px; }
  .card table { width: 100%; border-collapse: collapse; }
  .card th, .card td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #2e3440; font-size: 12px; vertical-align: top; }
  .resp { max-height: 280px; overflow: auto; white-space: pre-wrap; font-size: 12px; }
  .divergence { margin-top: 20px; border: 1px solid #2e3440; border-radius: 6px; padding: 14px; background: #11141a; }
  .divergence h2 { margin: 0 0 8px; font-size: 14px; }
  .pass { color: #a3be8c; }
  .fail { color: #bf616a; }
  .partial, .inconclusive { color: #ebcb8b; }
  .small { font-size: 11px; }
  .prism9 td { font-size: 12px; }
  .bar {
    display: inline-block;
    width: 100px;
    height: 8px;
    background: #2e3440;
    border-radius: 2px;
    vertical-align: middle;
    margin-right: 6px;
    overflow: hidden;
  }
  .bar-fill { display: block; height: 100%; background: #88c0d0; }
  .bar-val { font-size: 11px; color: #6b7280; }
</style>
