<script lang="ts">
  import { onMount } from 'svelte';
  import { v4 as uuid } from 'uuid';
  import { getOpenRouterKey, putSkill, putBundle } from '$lib/storage';
  import { chat, type ChatMessage } from '$lib/openrouter';
  import { newTrace, appendEdge, type InteractionTrace } from '$lib/trace';
  import { buildBundle } from '$lib/bundle/builder';
  import { verifyBundle } from '$lib/bundle/verify';
  import { WORKBENCH_VERSION, AMPERSAND_PROTOCOL_VERSION, SPEC_VERSION } from '$lib/version';
  import { FIXTURES, getFixture, scriptedEdgesFor, type FixtureScenario } from '$lib/fixtures';
  import { validateManifestDraft, hasErrors } from '$lib/manifest_validate';
  import { checkPhaseOrder, edgeToPhase, type PhaseCheckResult } from '$lib/ia';
  import * as delegatic from '$lib/mcp/delegatic';
  import * as bodyBrowser from '$lib/mcp/body_browser';
  import type { SkillManifest, BodyChoice, Capability, ProofResult, Verdict, ProofGate } from '$lib/types';

  let body: BodyChoice = 'simulator';
  let model = 'anthropic/claude-sonnet-4';
  let goal = '';
  let trace: InteractionTrace = newTrace();
  let messages: ChatMessage[] = [];
  let busy = false;
  let hasKey = false;
  let crystallizing = false;
  let skillName = '';
  let skillSlug = '';
  let skillDescription = '';
  let lastVerdict: { overall: Verdict; gates: ProofGate[]; bundle_id: string; content_hash: string } | null = null;

  // v0.2 — opt-in delegatic-mcp authority round-trip. When checked, crystallize
  // registers a permissive workspace policy and authorizes each declared
  // capability before sealing the bundle; gate.authority then verifies every
  // block's HMAC + TTL through the same delegatic-mcp `verify` tool.
  let useDelegatic = false;
  let delegaticStatus = '';

  // v0.2 — browser body via body-browser-mcp. Choosing this body causes the
  // teach loop to perceive + encode_state against the live MCP backend so the
  // trace records real state_hashes (Simulator backend on the server side
  // until the AgentBrowser/Chromium backend lands).
  let browserSession: { sess: import('$lib/mcp/client').McpSession; id: string } | null = null;
  let browserState: { url?: string; state_hash?: string } | null = null;

  // Reactive live validation against SKILL_MANIFEST.v0.schema.json
  // (the editable subset: name / slug / description). Recomputed on every
  // keystroke; the crystallize button stays disabled while any field errors.
  $: manifestErrors = validateManifestDraft({ name: skillName, slug: skillSlug, description: skillDescription });
  $: manifestValid = !hasErrors(manifestErrors);
  // v0.3 (M6) — live IA chain check of the trace. Backward phase transitions
  // within a cycle are surfaced as warnings *before* the user crystallizes so
  // they can investigate before sealing a SkillBundle with phase violations.
  $: phaseCheck = checkPhaseOrder(trace) as PhaseCheckResult;
  let fixtureId: string = '';
  let fixture: FixtureScenario | null = null;
  // Capabilities seeded by the active fixture. When no fixture is loaded the
  // crystallizer falls back to ['ambient'] (the default for freeform mode).
  let declaredCaps: Capability[] = ['ambient'];

  function loadFixture(id: string) {
    if (!id) {
      fixture = null;
      declaredCaps = ['ambient'];
      return;
    }
    const f = getFixture(id);
    if (!f) return;
    fixture = f;
    body = f.body_choice;
    declaredCaps = f.capabilities_declared;
    // Pre-fill the first user turn: task prompt + seeded example inputs.
    // Secret-seeded fixtures (redacted_export) deliberately put a fake key
    // into the goal field so the user can see it appear in the trace and
    // then disappear after redaction.
    const exampleInputs = f.inputs.map((i) => `${i.name}: ${JSON.stringify(i.example ?? '')}`).join('\n');
    const secretBlob = f.seeded_secrets?.length
      ? `\n(seeded secret in input: ${f.seeded_secrets[0]})`
      : '';
    goal = `${f.task_prompt}\n\n${exampleInputs}${secretBlob}`;
    skillName = f.id.replace(/^skill\./, '').replace(/_/g, ' ');
    skillSlug = f.id.replace(/^skill\./, '').replace(/_/g, '-');
    skillDescription = f.purpose;
    // Clear any prior trace state — fixture run starts fresh.
    trace = newTrace();
    messages = [];
    lastVerdict = null;
  }

  onMount(() => {
    hasKey = !!getOpenRouterKey();
  });

  // Map [&]-style capabilities to the concrete Delegatic action_types each
  // could perform. `ambient` is intentionally elided — it triggers no
  // consequential action and so needs no AuthorizationBlock.
  function capabilityActionTypes(caps: Capability[]): Array<{ capability: Capability; action_type: string }> {
    const out: Array<{ capability: Capability; action_type: string }> = [];
    for (const c of caps) {
      if (c === 'ambient') continue;
      const action_type =
        c === '&body.os' ? 'shell_exec' :
        c === '&body.browser' ? 'browser_act' :
        c.startsWith('&model.') ? 'model_call' :
        c.replace(/^&/, '').replace(/\./g, '_');
      out.push({ capability: c, action_type });
    }
    return out;
  }

  async function ensureBrowserBody() {
    if (browserSession) return browserSession;
    const sess = await bodyBrowser.connect();
    const id = 'workbench-' + uuid().slice(0, 8);
    await bodyBrowser.ensureSession(sess, id);
    browserSession = { sess, id };
    return browserSession;
  }

  async function send() {
    if (!goal.trim() || busy) return;
    busy = true;
    try {
      messages = [
        ...messages,
        { role: 'user', content: goal }
      ];
      await appendEdge(trace, { kind: 'user_message', observation: { content: goal } });

      // v0.2 — if the browser body is active, capture a real state_hash from
      // body-browser-mcp before the LLM call so the trace records what the
      // agent actually saw.
      if (body === 'browser') {
        const b = await ensureBrowserBody();
        const p = await bodyBrowser.perceive(b.sess, b.id);
        const e = await bodyBrowser.encodeState(b.sess, b.id);
        browserState = { url: p.observation.url, state_hash: e.state_hash };
        await appendEdge(trace, {
          kind: 'perception',
          capability: '&body.browser',
          observation: {
            url: p.observation.url,
            title: p.observation.title,
            subtype: p.observation.subtype,
            state_hash: e.state_hash,
            a11y_nodes: p.observation.a11y_tree.length
          }
        });
      }

      const res = await chat({ model, messages });
      const assistant = res.choices[0]?.message;
      if (assistant) {
        messages = [...messages, assistant];
        await appendEdge(trace, {
          kind: 'assistant_message',
          observation: { content: assistant.content, model: res.model }
        });
      }
      trace = trace; // force reactive
      goal = '';
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function crystallize() {
    if (!skillName.trim() || !skillSlug.trim()) return;
    crystallizing = true;
    lastVerdict = null;
    try {
      // If a fixture is active, splice its scripted edges into the trace
      // before sealing. For skill.authority_denied this injects an edge
      // tagged with an undeclared capability — the proof system MUST then
      // fail gate.no_hidden_capability + gate.authority, which is the
      // CORRECT outcome per that fixture's pass_criteria.
      if (fixture) {
        for (const se of scriptedEdgesFor(fixture.id)) {
          await appendEdge(trace, { kind: se.kind, capability: se.capability, observation: se.observation });
        }
        trace = trace;
      }

      const now = new Date().toISOString();
      const manifest: SkillManifest = {
        schema: 'https://opensentience.org/spec/skill-manifest/v0.1',
        skill_id: uuid(),
        name: skillName.trim(),
        slug: skillSlug.trim(),
        description: skillDescription.trim(),
        version: 1,
        derived_from_trace_id: trace.trace_id,
        body_choice: body,
        inputs: [{ name: 'goal', type: 'string', required: true }],
        outputs: [{ name: 'final_message', type: 'string' }],
        preconditions: [],
        binding: 'model_version_bound',
        validated_against: [{ model, fidelity: 1.0, level: 'exact', ts: now }],
        capabilities_required: declaredCaps,
        created_at: now,
        updated_at: now
      };

      // Seed a ProofResult shell; verifyBundle will overwrite gate-level
      // judgements when we re-verify the assembled bundle below.
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

      // v0.2.1 — opt-in delegatic-mcp authority round-trip.
      // For each capability declared on the manifest that maps to a destructive
      // action_type, request a fresh AuthorizationBlock and attach it to the
      // bundle's authority_result. gate.authority will re-verify these blocks
      // through delegatic-mcp on every verify pass when useDelegatic is set.
      let authorizationBlocks: NonNullable<ProofResult['authority_result']['authorization_blocks']> = [];
      if (useDelegatic) {
        delegaticStatus = 'connecting…';
        try {
          const sess = await delegatic.connect();
          const policyId = `workbench/${manifest.slug}`;
          const allowed = capabilityActionTypes(declaredCaps);
          await delegatic.putPolicy(sess, {
            policy_id: policyId,
            allow_actions: JSON.stringify(allowed.map((a) => a.action_type)),
            max_ttl_seconds: 300,
            description: `workbench skill ${manifest.slug}`
          });
          delegaticStatus = `policy ${policyId} registered`;
          for (const a of allowed) {
            const r = await delegatic.authorize(sess, {
              action_type: a.action_type,
              policy_id: policyId,
              agent_id: 'workbench:teach',
              approved_by: 'user@workbench.local'
            });
            authorizationBlocks.push({
              capability: a.capability,
              action_type: a.action_type,
              ...r.authorization_block
            });
          }
          delegaticStatus = `${authorizationBlocks.length} authorization block(s) issued`;
        } catch (err) {
          delegaticStatus = `delegatic unavailable: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      proof.authority_result = {
        decision: 'allow',
        authorization_blocks: authorizationBlocks.length > 0 ? authorizationBlocks : undefined
      };

      const bundle = await buildBundle({ manifest, trace, proof });
      const report = await verifyBundle(bundle, { useDelegatic });

      // Stamp the verdict back into the bundle's proof block so the persisted
      // bundle is self-describing. We re-seal the content_hash afterwards so
      // it still verifies on import.
      bundle.proof = {
        ...proof,
        overall_verdict: report.overall_verdict,
        proof_gates: report.gates,
        ia_substrate: report.ia_substrate,
        replay_result: {
          ...proof.replay_result,
          status: report.gates.find((g) => g.id === 'gate.replay_fidelity')?.verdict === 'pass'
            ? 'success'
            : 'not_run',
          fidelity_level:
            (report.gates.find((g) => g.id === 'gate.replay_fidelity')?.level ?? 'inconclusive')
        }
      };
      const { bundleContentHash } = await import('$lib/hash');
      bundle.content_hash = await bundleContentHash(bundle as unknown as Record<string, unknown>);

      await putSkill(manifest);
      await putBundle(bundle);

      lastVerdict = {
        overall: report.overall_verdict,
        gates: report.gates,
        bundle_id: bundle.bundle_id,
        content_hash: bundle.content_hash
      };

      // reset teach state (keep verdict visible)
      trace = newTrace();
      messages = [];
      skillName = '';
      skillSlug = '';
      skillDescription = '';
    } finally {
      crystallizing = false;
    }
  }
</script>

<h1>Teach</h1>
<p class="muted">
  Drive an interaction. Every step lands in the trace. When you’re happy, crystallize it as a SkillBundle.
</p>

{#if !hasKey}
  <div class="warn">
    No OpenRouter key in this session. <a href="/">Set one on the landing page</a> before teaching.
  </div>
{/if}

<section class="fixture">
  <label>Fixture scenario (spec §8.4)
    <select bind:value={fixtureId} on:change={() => loadFixture(fixtureId)}>
      <option value="">— freeform —</option>
      {#each FIXTURES as f}
        <option value={f.id}>{f.id}</option>
      {/each}
    </select>
  </label>
  {#if fixture}
    <div class="fixture-info">
      <p><strong>Purpose:</strong> {fixture.purpose}</p>
      <p>
        <strong>Expected verdict:</strong>
        <span class={fixture.pass_criteria.overall_verdict}>{fixture.pass_criteria.overall_verdict}</span>
        · gates exercised: <code>{fixture.proof_gates_exercised.join(', ')}</code>
      </p>
      <p>
        <strong>Capabilities declared:</strong> <code>{fixture.capabilities_declared.join(', ')}</code>
        {#if fixture.capabilities_attempted.some((c) => !fixture.capabilities_declared.includes(c))}
          · <strong>attempted:</strong> <code>{fixture.capabilities_attempted.join(', ')}</code>
          <span class="muted">(the extra ones are injected at crystallize-time to trigger denial)</span>
        {/if}
      </p>
    </div>
  {/if}
</section>

<section class="config">
  <label>Body
    <select bind:value={body}>
      <option value="simulator">simulator</option>
      <option value="browser">browser (body-browser-mcp · v0.2)</option>
      <option value="host" disabled>host (v0.2.x)</option>
    </select>
  </label>
  <label>Model
    <input bind:value={model} />
  </label>
  <label class="checkbox">
    <input type="checkbox" bind:checked={useDelegatic} />
    Authorize via delegatic-mcp (v0.2.1)
  </label>
</section>
{#if body === 'browser' && browserState}
  <div class="browser-state">
    <strong>browser body</strong>
    · url <code>{browserState.url ?? '—'}</code>
    · state <code>{browserState.state_hash?.slice(0, 22) ?? '—'}…</code>
  </div>
{/if}
{#if useDelegatic && delegaticStatus}
  <div class="delegatic-status">delegatic-mcp · {delegaticStatus}</div>
{/if}

<section class="chat">
  <div class="messages">
    {#each messages as m}
      <div class="msg msg-{m.role}">
        <strong>{m.role}</strong>
        <pre>{m.content}</pre>
      </div>
    {/each}
    {#if messages.length === 0}
      <p class="muted">No messages yet. Type a goal below to start.</p>
    {/if}
  </div>

  <form on:submit|preventDefault={send}>
    <textarea bind:value={goal} rows="3" placeholder="What should the agent try?"></textarea>
    <button type="submit" disabled={!hasKey || busy || !goal.trim()}>
      {busy ? 'Working…' : 'Send'}
    </button>
  </form>
</section>

<section class="trace">
  <h2>Trace · {trace.edges.length} edges</h2>
  {#if trace.edges.length > 0}
    <p class="muted small">
      Phase check (IA <code>chain</code>): {phaseCheck.cycles} cycle(s) ·
      {#if phaseCheck.ok}
        <span class="pass">monotone ✓</span>
      {:else}
        <span class="fail">{phaseCheck.violations.length} backward transition(s)</span>
      {/if}
    </p>
  {/if}
  <ol>
    {#each trace.edges as e}
      {@const ph = edgeToPhase(e.kind)}
      <li>
        <code>{e.index}</code> {e.kind}
        {#if ph}<span class="phase phase-{ph}">{ph}</span>{/if}
        {e.capability ? ` · ${e.capability}` : ''}{e.state_hash ? ` · ${e.state_hash.slice(0, 18)}…` : ''}
      </li>
    {/each}
  </ol>
  {#if !phaseCheck.ok}
    <div class="phase-warn">
      <strong>Phase violations</strong>
      <ul>
        {#each phaseCheck.violations as v}
          <li>
            cycle <code>{v.cycle_index}</code> · edge <code>{v.from_edge_index}</code>
            (<code>{v.from_phase ?? '—'}</code>) → edge <code>{v.to_edge_index}</code>
            (<code>{v.to_phase ?? '—'}</code>): {v.message}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<section class="crystallize">
  <h2>Crystallize</h2>
  <p class="muted">
    Seals the trace into a SkillBundle and computes a ProofResult across all six gates.
    Authority is checked against a local kernel in v0.1 — a real delegatic-mcp round-trip arrives in v0.2.
  </p>
  <div class="manifest-editor">
    <label>
      Name
      <input placeholder="Skill name" bind:value={skillName} aria-invalid={!!manifestErrors.name} />
      {#if manifestErrors.name}<span class="field-err">{manifestErrors.name}</span>{/if}
    </label>
    <label>
      Slug
      <input placeholder="slug-like-this" bind:value={skillSlug} aria-invalid={!!manifestErrors.slug} />
      {#if manifestErrors.slug}<span class="field-err">{manifestErrors.slug}</span>{/if}
    </label>
    <label>
      Description
      <textarea placeholder="One-paragraph description of what this skill does." rows="3"
        bind:value={skillDescription} aria-invalid={!!manifestErrors.description}></textarea>
      {#if manifestErrors.description}<span class="field-err">{manifestErrors.description}</span>{/if}
    </label>
    <div class="row">
      <span class="muted">
        {#if manifestValid}
          <span class="pass">✓ manifest valid</span>
        {:else}
          <span class="fail">✗ manifest invalid — fix highlighted fields</span>
        {/if}
        · validates live against <code>SKILL_MANIFEST.v0.schema.json</code> (spec §8.3 AC #6)
      </span>
      <button on:click={crystallize} disabled={trace.edges.length === 0 || !manifestValid || crystallizing}>
        {crystallizing ? 'Crystallizing…' : 'Crystallize'}
      </button>
    </div>
  </div>

  {#if lastVerdict}
    <div class="verdict">
      <h3>
        Verdict: <span class={lastVerdict.overall}>{lastVerdict.overall}</span>
        {#if fixture}
          {@const matched = lastVerdict.overall === fixture.pass_criteria.overall_verdict}
          · <span class="muted">expected <code>{fixture.pass_criteria.overall_verdict}</code></span>
          · <span class={matched ? 'pass' : 'fail'}>{matched ? 'fixture passed' : 'fixture FAILED'}</span>
        {/if}
      </h3>
      <p class="muted">
        <code>{lastVerdict.bundle_id}</code> · <code>{lastVerdict.content_hash.slice(0, 22)}…</code>
      </p>
      <table>
        <thead><tr><th>Gate</th><th>Verdict</th><th>Reason</th></tr></thead>
        <tbody>
          {#each lastVerdict.gates as g}
            <tr>
              <td><code>{g.id}</code></td>
              <td><span class={g.verdict}>{g.verdict}</span></td>
              <td>{g.reason ?? (g.level ? `level: ${g.level}` : '—')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="muted">
    Workbench {WORKBENCH_VERSION} · [&amp;] Protocol {AMPERSAND_PROTOCOL_VERSION}
  </p>
</section>

<style>
  .muted { color: #6b7280; }
  .warn {
    border: 1px solid #bf616a; background: #2a1c1d; padding: 10px 14px;
    border-radius: 4px; margin: 12px 0;
  }
  .fixture { margin: 16px 0; }
  .fixture label { display: block; }
  .fixture-info { margin-top: 8px; border: 1px solid #2e3440; border-radius: 6px; padding: 10px 12px; background: #11141a; font-size: 13px; }
  .fixture-info p { margin: 4px 0; }
  .fixture-info .pass { color: #a3be8c; }
  .fixture-info .fail { color: #bf616a; }
  .fixture-info .partial, .fixture-info .inconclusive { color: #ebcb8b; }
  .config { display: flex; gap: 16px; margin: 16px 0; align-items: flex-end; }
  .config label { flex: 1; display: block; }
  .config label.checkbox { flex: 0 0 auto; display: flex; gap: 6px; align-items: center; padding-bottom: 4px; }
  .browser-state { font-size: 12px; color: #88c0d0; margin-bottom: 8px; }
  .delegatic-status { font-size: 12px; color: #ebcb8b; margin-bottom: 8px; }
  .chat .messages { border: 1px solid #2e3440; border-radius: 6px; padding: 12px; min-height: 240px; background: #11141a; }
  .msg { margin-bottom: 10px; }
  .msg strong { color: #88c0d0; }
  .msg-user strong { color: #ebcb8b; }
  form { display: flex; gap: 8px; margin-top: 12px; }
  form textarea { flex: 1; }
  .trace ol { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; }
  .small { font-size: 12px; }
  .phase {
    display: inline-block;
    padding: 0 6px;
    margin-left: 6px;
    border-radius: 4px;
    font-size: 10px;
    text-transform: uppercase;
  }
  .phase-retrieve { background: #2e3a4e; color: #88c0d0; }
  .phase-route    { background: #3a3a4e; color: #b48ead; }
  .phase-act      { background: #4e3a2e; color: #d08770; }
  .phase-learn    { background: #2e4e3a; color: #a3be8c; }
  .phase-consolidate { background: #3a4e3a; color: #a3be8c; }
  .phase-warn {
    border: 1px solid #ebcb8b; background: #2a2618; padding: 10px 14px;
    border-radius: 4px; margin: 8px 0; font-size: 12px; color: #ebcb8b;
  }
  .phase-warn ul { margin: 4px 0 0 0; }
  .trace .pass { color: #a3be8c; }
  .trace .fail { color: #bf616a; }
  .crystallize .row { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-top: 8px; }
  .manifest-editor label { display: block; margin-bottom: 10px; }
  .manifest-editor label > input,
  .manifest-editor label > textarea { margin-top: 4px; }
  .manifest-editor [aria-invalid="true"] { border-color: #bf616a; }
  .field-err { display: inline-block; margin-top: 4px; color: #bf616a; font-size: 12px; }
  .crystallize .pass { color: #a3be8c; }
  .crystallize .fail { color: #bf616a; }
  .verdict { margin-top: 16px; border: 1px solid #2e3440; border-radius: 6px; padding: 12px; background: #11141a; }
  .verdict h3 { margin: 0 0 6px; font-size: 14px; }
  .verdict table { width: 100%; border-collapse: collapse; }
  .verdict th, .verdict td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e3440; font-size: 12px; }
  .verdict .pass { color: #a3be8c; }
  .verdict .fail { color: #bf616a; }
  .verdict .partial, .verdict .inconclusive { color: #ebcb8b; }
</style>
