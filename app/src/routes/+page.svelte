<script lang="ts">
  import PageHead from '$lib/PageHead.svelte';
  import { WORKBENCH_VERSION } from '$lib/version';
</script>

<PageHead
  title="Prove what your agent already did"
  description="Workbench turns a Claude Code session you already ran into a SkillBundle — a signed, replayable record scored against six proof gates. No account, no API key, nothing leaves your browser."
  path="/"
  type="SoftwareApplication"
/>

<section class="hero">
  <h1>You already did the work. Prove it.</h1>
  <p class="lede">
    Workbench turns a coding session you already ran into a <strong>SkillBundle</strong> — a
    signed, replayable record of what happened, scored against six proof gates. Drop a Claude
    Code transcript and you have one in about a second.
  </p>
  <p class="cta">
    <a class="btn" href="/record">Record a session →</a>
    <span class="muted">No account. No API key. Nothing leaves your browser.</span>
  </p>
</section>

<section class="grid">
  <article>
    <h3>1 · Record</h3>
    <p>
      Drop <code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>. Workbench streams
      it, splits it at each turn you took, and turns every tool call and result into a trace edge.
    </p>
    <a href="/record">Start here →</a>
  </article>
  <article>
    <h3>2 · Verify</h3>
    <p>
      Six gates run over the sealed bundle — content hash, trace completeness, hidden capability,
      authority, redaction, replay fidelity. Each verdict is computed by an Invariant Arithmetic
      <code>consume</code> call and says which law produced it.
    </p>
  </article>
  <article>
    <h3>3 · Replay</h3>
    <p>
      Re-execute the skill against the same body and see where reality drifted. Surprises are
      typed and carry the same law projection as the gate they violate.
    </p>
    <a href="/skills">Browse the library →</a>
  </article>
</section>

<section class="panel">
  <h2>What makes a bundle worth having</h2>
  <dl>
    <dt>It cannot quietly understate what it did.</dt>
    <dd>
      Every capability the trace exercised must be declared. Withhold one and
      <code>gate.no_hidden_capability</code> and <code>gate.authority</code> both fail and name it.
      A tool Workbench doesn't recognize is recorded as <code>&amp;host.unknown_*</code> — never as
      <code>ambient</code>, because "we don't know what this needs" and "this needs nothing" are
      different claims.
    </dd>
    <dt>It tells you what it left out.</dt>
    <dd>
      Thinking blocks, subagent turns, unparsable lines — all counted and shown. A zero and a blank
      look identical in a table and mean opposite things.
    </dd>
    <dt>It can be handed to someone else.</dt>
    <dd>
      Three redaction profiles, applied before a bundle is saved. <code>transcript_pii</code> walks
      observations <em>and</em> tool arguments — a key in a shell command is the likeliest secret in
      a real session, not one in a payload.
    </dd>
  </dl>
</section>

<section class="panel alt">
  <h2>Teaching from scratch</h2>
  <p class="muted">
    If you want to drive a fresh interaction rather than record one you already ran, the
    <a href="/teach">Teach</a> flow does that — it's the one surface that calls a model, so it's the
    one that asks for an OpenRouter key. Everything downstream is identical: same trace format, same
    six gates, same library.
  </p>
</section>

<p class="ver">Workbench v{WORKBENCH_VERSION} · <a href="/prism">PRISM leaderboard</a> · <a href="/import">Import a bundle</a></p>

<style>
  .hero { margin-bottom: 34px; }
  .hero h1 { font-size: 30px; margin: 0 0 10px; letter-spacing: -0.01em; }
  .lede { font-size: 16px; color: #c0c5ce; max-width: 720px; margin: 0 0 18px; }
  .cta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0; }
  .btn {
    display: inline-block; background: #2e3440; border: 1px solid #4c566a;
    color: #eceff4; padding: 9px 16px; border-radius: 4px; font-weight: 500;
  }
  .btn:hover { background: #3b4252; text-decoration: none; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .grid article { border: 1px solid #2e3440; border-radius: 6px; padding: 16px; background: #11141a; }
  .grid h3 { margin: 0 0 6px; font-size: 15px; }
  .grid p { color: #b0b5be; margin: 0 0 8px; }

  .panel { border: 1px solid #2e3440; border-radius: 6px; padding: 18px; background: #11141a; margin-bottom: 20px; }
  .panel h2 { margin: 0 0 10px; font-size: 16px; }
  .panel.alt { background: #0f1218; }
  .panel p { margin: 0; }

  dl { margin: 0; }
  dt { color: #eceff4; font-weight: 500; margin-top: 12px; }
  dt:first-child { margin-top: 0; }
  dd { margin: 4px 0 0; color: #b0b5be; }

  .muted { color: #6b7280; }
  .ver { color: #6b7280; font-size: 12px; }
</style>
