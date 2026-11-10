// `bun build.ts` (npm run build): one executable for the platform it runs on — a .app on macOS,
// a console-less .exe on Windows, a bare binary on Linux. The name, identifier, version and icon
// come from the `app` options standalone.ts hands render(). `--archive` also writes the archive to
// distribute and the fragment an update manifest is made from, which the release workflow uploads.
// `--aot` and `--trim` turn on Bun's experimental compile options for a smaller executable.

import { build } from 'gpuix-svelte/build';

await build({
	entry: './standalone.ts',
	archive: process.argv.includes('--archive'),
	aot: process.argv.includes('--aot'),
	trim: process.argv.includes('--trim')
});
