/**
 * Builds the whole application into one self-contained HTML file.
 *
 * Everything is inlined — CSS, JavaScript, the engine packages — because the
 * page is published to a host with a strict content policy that blocks every
 * outbound request. That constraint is useful rather than annoying: a file
 * that cannot fetch anything is a file that provably runs the code it ships
 * with, which is the point of showing this particular product.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const repoRoot = resolve(webRoot, '../..');
const outDir = resolve(webRoot, 'dist-demo');

const alias = {
  // The demo has no router. See `demo/shims`.
  'next/link': resolve(here, 'shims/next-link.tsx'),
  'next/navigation': resolve(here, 'shims/next-navigation.ts'),
  // Engine packages resolve to source so the bundle carries the same code the
  // tests run against, not a stale `dist`.
  '@plan2quote/core': resolve(repoRoot, 'packages/core/src/index.ts'),
  '@plan2quote/geometry': resolve(repoRoot, 'packages/geometry/src/index.ts'),
  '@plan2quote/classify': resolve(repoRoot, 'packages/classify/src/index.ts'),
  '@plan2quote/parsers': resolve(repoRoot, 'packages/parsers/src/index.ts'),
};

const js = await build({
  entryPoints: [resolve(here, 'entry.tsx')],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  write: false,
  alias,
  // The engine packages are NodeNext sources importing each other with explicit
  // `.js` extensions. That is correct TypeScript for ESM output and wrong for a
  // bundler looking at the sources, so the extension is mapped back.
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'js-to-ts',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
          if (!args.importer.includes(`${'packages'}/`)) return null;
          const candidate = resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
          return { path: candidate };
        });
      },
    },
  ],
});

const css = await build({
  stdin: {
    contents: [
      "@import '@mantine/core/styles.css';",
      "@import '@mantine/notifications/styles.css';",
      "@import '@mantine/dropzone/styles.css';",
      `@import '${resolve(webRoot, 'app/globals.css')}';`,
    ].join('\n'),
    resolveDir: webRoot,
    loader: 'css',
  },
  bundle: true,
  minify: true,
  write: false,
});

const script = js.outputFiles[0].text;
// `globals.css` re-imports the Mantine sheets; esbuild deduplicates them.
const styles = css.outputFiles[0].text;

const html = `<style>
${styles}
/* The artifact host controls the document element, so the page paints its own
   background rather than inheriting one. */
#p2q-root { min-height: 100vh; }
</style>
<div id="p2q-root"></div>
<script>
${script}
</script>
`;

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'index.html'), html, 'utf8');

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`demo written: ${resolve(outDir, 'index.html')}`);
console.log(`  script ${kb(script.length)}, styles ${kb(styles.length)}, total ${kb(html.length)}`);
