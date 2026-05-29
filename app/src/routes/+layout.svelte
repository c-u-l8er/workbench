<script lang="ts">
  import { WORKBENCH_VERSION } from '$lib/version';
</script>

<header>
  <nav>
    <a href="/" class="brand">Workbench</a>
    <a href="/teach">Teach</a>
    <a href="/skills">Skills</a>
    <a href="/compare">Compare</a>
    <a href="/prism">PRISM</a>
    <a href="/import">Import</a>
  </nav>
  <span class="ver">v{WORKBENCH_VERSION}</span>
</header>

<main>
  <slot />
</main>

<footer>
  <span>[&amp;] Stack · Workbench</span>
  <a href="https://opensentience.org" target="_blank" rel="noreferrer">opensentience.org</a>
</footer>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #0c0e12;
    color: #d8dee9;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  :global(a) { color: #88c0d0; text-decoration: none; }
  :global(a:hover) { text-decoration: underline; }
  :global(button) {
    background: #2e3440; color: #eceff4; border: 1px solid #4c566a;
    padding: 6px 12px; border-radius: 4px; cursor: pointer; font: inherit;
  }
  :global(button:hover:not(:disabled)) { background: #3b4252; }
  :global(button:disabled) { opacity: 0.5; cursor: not-allowed; }
  :global(input, textarea, select) {
    background: #1a1d23; color: #eceff4; border: 1px solid #3b4252;
    padding: 6px 8px; border-radius: 4px; font: inherit; width: 100%; box-sizing: border-box;
  }
  :global(code, pre) { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; }
  :global(pre) { background: #1a1d23; padding: 10px; border-radius: 4px; overflow: auto; }
  :global(h1, h2, h3) { color: #eceff4; }

  header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 24px; border-bottom: 1px solid #2e3440; background: #11141a;
  }
  nav { display: flex; gap: 18px; }
  .brand { font-weight: 600; color: #eceff4; }
  .ver { color: #6b7280; font-size: 12px; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; }
  footer {
    display: flex; justify-content: space-between; padding: 18px 24px;
    border-top: 1px solid #2e3440; color: #6b7280; font-size: 12px;
  }
</style>
