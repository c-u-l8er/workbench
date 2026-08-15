<script lang="ts">
  // Per-route head: title, description, canonical, JSON-LD.
  //
  // Every route needs its own, because until 2026-08-14 this app served a
  // 1,667-byte shell on every path — no <title>, no JSON-LD, zero extractable
  // words — and alkeyword's portfolio crawl recorded 0 claims for the whole
  // surface (`spa_pages`, `pages_without_schema`). The JSON-LD shape mirrors
  // `docs/prerender.mjs` so the two crawlable surfaces agree.

  export let title: string;
  export let description: string;
  /** Path with leading slash, e.g. '/record'. Trailing slash is added for '/'. */
  export let path: string;
  export let type: 'WebPage' | 'CollectionPage' | 'SoftwareApplication' | 'TechArticle' = 'WebPage';

  const HOST = 'https://workbench.opensentience.org';

  $: url = path === '/' ? HOST + '/' : HOST + path;
  $: fullTitle = path === '/' ? `${title} · Workbench` : `${title} · Workbench`;
  $: ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': type,
    name: title,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'Workbench', url: HOST + '/' }
  });
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <!-- Svelte strips <script> from templates, so JSON-LD goes in as raw HTML.
       It is `application/ld+json`, never executed, so the spec §7.5 CSP
       (no inline scripts, no eval) is not weakened by it. -->
  {@html `<script type="application/ld+json">${ld}</script>`}
</svelte:head>
