// Prerender every route by default.
//
// Before this, adapter-static ran with `fallback: 'index.html'` and no page
// opted in, so the deployed site was a 1,667-byte shell on every path: zero
// extractable words, no <title>, no JSON-LD. See docs/ROADMAP.md §2(a).
//
// `/skills/[id]` opts back out — its ids come from the visitor's own IndexedDB,
// so there is no build-time entry list and nothing meaningful to prerender.
export const prerender = true;
export const trailingSlash = 'ignore';
