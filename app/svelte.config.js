import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // NOT 'index.html'. Every route is prerendered now, and naming the
      // fallback index.html makes adapter-static overwrite the prerendered
      // homepage with an empty shell — silently, with only a build-log notice.
      // The fallback exists solely for /skills/<id>, whose ids come from the
      // visitor's IndexedDB; static/_redirects routes those to it with a 200.
      fallback: 'fallback.html',
      precompress: false,
      strict: false
    }),
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;
