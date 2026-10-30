// `npm run compile`: the tic-tac-toe example through `gpuix-svelte/build`, the same call a
// scaffolded app's build.ts makes — dist/Tic-tac-toe.app here, dist/tic-tac-toe.exe on Windows.

import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
	console.error('[compile] needs Bun — `npm run compile` runs `bun scripts/compile.ts`');
	process.exit(1);
}

// Imported after the guard: a static import would hoist `bun` above it.
const { build } = await import('../src/build.ts');

await build({
	entry: fileURLToPath(new URL('../examples/tic-tac-toe/standalone.ts', import.meta.url)),
	outdir: fileURLToPath(new URL('../dist', import.meta.url))
});
