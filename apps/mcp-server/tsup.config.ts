import { defineConfig } from 'tsup';

/** Self-contained bundles shipped inside the Claude Code plugin (no install step for users). */
export default defineConfig({
  entry: { mcp: 'src/main.ts', hook: 'src/hook.ts' },
  outDir: '../../plugins/claude-code/dist',
  outExtension: () => ({ js: '.mjs' }),
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  splitting: false,
  minify: true,
  noExternal: [/.*/],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
