/**
 * Builds the docs site's playground (playground/) with Vite: the page's own script, and one frame
 * per renderer. Each frame is built with every module a playground component may import as an
 * entry of its own, so the code the page compiles in the browser can import those files by URL and
 * land on the same Svelte runtime and renderer as the frame. scripts/docs.ts calls this and writes
 * the page around `PLAYGROUND_BODY`.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as vite_build, normalizePath, type Plugin, type PluginOption } from 'vite';
import { compile_svelte } from '../src/compile.ts';
import { MODULES, file_of, type Target } from '../playground/modules.ts';
import { dom_plugins } from './vite-dom.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const source_dir = join(root, 'playground');
const entries_dir = join(root, 'dist/playground-entries');
const native_dir = dirname(fileURLToPath(import.meta.resolve('@gpuix/native')));

const NATIVE = '\0gpuix-native-wasm';

// @gpuix/native's own browser entry imports the wasm `with { type: 'file' }`, which only Bun's bundler reads.
const native_entry = `import init, { GpuixRenderer } from ${JSON.stringify(normalizePath(join(native_dir, 'wasm/gpuix-web.js')))};
import wasm_url from ${JSON.stringify(`${normalizePath(join(native_dir, 'wasm/gpuix-web_bg.wasm'))}?url`)};
await init({ module_or_path: wasm_url });
export { GpuixRenderer };
export const isTerminal = () => false;
`;

/** The GPUI side of the package as a browser bundle: what scripts/web.ts has Bun do, for Vite. */
const gpui_plugin: Plugin = {
	name: 'gpuix-svelte-gpui',
	enforce: 'pre',
	resolveId(id) {
		if (id === '@gpuix/native') return NATIVE;
		if (id === 'gpuix-svelte') return join(root, 'src/web.ts');
		if (id === 'gpuix-svelte/renderer') return join(root, 'src/renderer.ts');
		if (id.startsWith('gpuix-svelte/components/')) return join(root, 'src/components', id.slice('gpuix-svelte/components/'.length));
	},
	load(id) {
		if (id === NATIVE) return native_entry;
		if (id.endsWith('.svelte')) return compile_svelte(id);
	}
};

/** The faces GPUI's wasm embeds (it cannot reach system fonts, and has no `registerFont`), so the DOM frame draws the same glyphs. */
const GPUI_FACES: Array<[family: string, file: string, weight: number, style: string]> = [
	['IBM Plex Sans', 'IBMPlexSans-Regular', 400, 'normal'],
	['IBM Plex Sans', 'IBMPlexSans-Italic', 400, 'italic'],
	['IBM Plex Sans', 'IBMPlexSans-SemiBold', 600, 'normal'],
	['IBM Plex Sans', 'IBMPlexSans-SemiBoldItalic', 600, 'italic'],
	['Lilex', 'Lilex-Regular', 400, 'normal'],
	['Lilex', 'Lilex-Italic', 400, 'italic'],
	['Lilex', 'Lilex-Bold', 700, 'normal'],
	['Lilex', 'Lilex-BoldItalic', 700, 'italic']
];

const GPUI_FONT_FACES = GPUI_FACES.map(
	([family, file, weight, style]) =>
		`@font-face{font-family:"${family}";src:url("../../assets/fonts/gpui/${file}.woff2") format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`
).join('');

const FRAME_STYLE: Record<Target, string> = {
	gpui: `*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100%;height:100%;touch-action:none}html,body,canvas{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}[data-gpui-input]{-webkit-user-select:text!important;user-select:text!important}`,
	dom: `${GPUI_FONT_FACES}*,*::before,*::after{box-sizing:border-box}html{background:#000;color:#fff;color-scheme:dark}body{font:16px "IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}::selection{background:#ff3e0059}text{display:inline}`
};

const frame_html = (target: Target) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>gpuix-svelte playground result (${target === 'gpui' ? 'GPUI' : 'DOM'})</title>
<style>${FRAME_STYLE[target]}</style>
<script type="module" src="frame.js"></script>
</head>
<body></body>
</html>
`;

async function build_frame(target: Target, out: string, plugins: PluginOption[], conditions?: string[]) {
	const dir = join(entries_dir, target);
	mkdirSync(dir, { recursive: true });
	const input: Record<string, string> = { frame: join(source_dir, `frame-${target}.ts`) };
	for (const m of MODULES[target]) {
		const name = file_of(m.specifier).slice(0, -'.js'.length);
		const spec = JSON.stringify(m.specifier);
		input[name] = join(dir, `${name}.js`);
		writeFileSync(input[name], `import ${spec};\nexport * from ${spec};\n${m.default ? `export { default } from ${spec};\n` : ''}`);
	}
	await vite_build({
		root: source_dir,
		// Relative, so the site works from a subpath and each frame finds its chunks and the wasm beside it.
		base: './',
		configFile: false,
		logLevel: 'warn',
		plugins,
		...(conditions && { resolve: { conditions } }),
		build: {
			outDir: join(out, target),
			emptyOutDir: false,
			copyPublicDir: false,
			target: 'esnext',
			// Mostly the 20 MB wasm, which no setting makes smaller.
			chunkSizeWarningLimit: Infinity,
			rolldownOptions: {
				input,
				// The page's compiled code imports these entries by name, so each has to keep its exports.
				preserveEntrySignatures: 'strict',
				// wasm-bindgen's glue calls eval for one of its imports, which is not ours to rewrite.
				onLog: (level, log, handler) => log.code === 'EVAL' || handler(level, log),
				output: { entryFileNames: '[name].js', chunkFileNames: 'chunk-[hash].js', assetFileNames: '[name][extname]' }
			}
		}
	});
	writeFileSync(join(out, target, 'index.html'), frame_html(target));
}

/** Writes `<out_dir>/playground/` (the page script and both frames) and `<out_dir>/playground-sw.js`. */
export async function build_playground(out_dir: string) {
	const out = join(out_dir, 'playground');
	rmSync(entries_dir, { recursive: true, force: true });
	await vite_build({
		root: source_dir,
		// Relative, so the site works from a subpath and each frame finds its chunks and the wasm beside it.
		base: './',
		configFile: false,
		logLevel: 'warn',
		build: {
			outDir: out,
			emptyOutDir: false,
			copyPublicDir: false,
			target: 'esnext',
			chunkSizeWarningLimit: Infinity,
			rolldownOptions: {
				input: join(source_dir, 'main.ts'),
				output: { entryFileNames: 'main.js', chunkFileNames: 'main-[hash].js', assetFileNames: '[name][extname]' }
			}
		}
	});
	await build_frame('gpui', out, [gpui_plugin], ['custom-renderer', 'module', 'browser', 'development|production']);
	await build_frame('dom', out, dom_plugins({ emitCss: false }));
	copyFileSync(join(source_dir, 'sw.js'), join(out_dir, 'playground-sw.js'));
}

export const PLAYGROUND_CSS = readFileSync(join(source_dir, 'page.css'), 'utf8');

// Runs before anything else on the page: without isolation the wasm cannot start, and the service
// worker only takes effect on the load after the one that registered it.
export const PLAYGROUND_ISOLATE = `if (!crossOriginIsolated && isSecureContext && 'serviceWorker' in navigator) {
	const safari = /Safari\\//.test(navigator.userAgent) && !/Chrom(e|ium)\\//.test(navigator.userAgent);
	navigator.serviceWorker.register('playground-sw.js?coep=' + (safari ? 'require-corp' : 'credentialless'), { scope: './playground' }).then(() => navigator.serviceWorker.ready).then(() => {
		try {
			if (sessionStorage.getItem('playground-isolating')) return;
			sessionStorage.setItem('playground-isolating', '1');
		} catch {
			return;
		}
		location.reload();
	}).catch((error) => console.warn('[playground] no service worker, so no GPUI renderer:', error));
} else {
	try { sessionStorage.removeItem('playground-isolating'); } catch {}
}`;

export const PLAYGROUND_BODY = `<main id="content" class="pg">
<div class="pg-bar">
<h1>Playground</h1>
<label class="pg-field">Example <select id="pg-example"></select></label>
<div class="pg-seg" role="group" aria-label="Renderer">
<button type="button" data-target="gpui" aria-pressed="true" title="GPUI itself, compiled to WebAssembly, painting a canvas">GPUI</button>
<button type="button" data-target="dom" aria-pressed="false" title="Svelte's DOM renderer with the DOM versions of the helpers and components">DOM</button>
</div>
<span class="pg-status" id="pg-status" role="status"></span>
<button class="tool" id="pg-share" type="button" hidden>Copy link</button>
</div>
<div class="pg-split">
<section class="pg-pane pg-editor" aria-label="Source">
<div class="pg-head">App.svelte</div>
<div id="pg-editor"></div>
</section>
<section class="pg-pane pg-output" aria-label="Output">
<div class="pg-head">
<div class="pg-seg" role="group" aria-label="View">
<button type="button" data-view="result" aria-pressed="true">Result</button>
<button type="button" data-view="tree" aria-pressed="false">Render tree</button>
<button type="button" data-view="mutations" aria-pressed="false">Mutations</button>
<button type="button" data-view="js" aria-pressed="false">Compiled JS</button>
</div>
<span class="pg-count" id="pg-count"></span>
</div>
<div class="pg-views">
<div class="pg-view" id="pg-result">
<iframe id="pg-frame-gpui" title="The component rendered by GPUI" hidden></iframe>
<iframe id="pg-frame-dom" title="The component rendered in the DOM" hidden></iframe>
<p class="pg-notice" id="pg-notice" hidden></p>
</div>
<div class="pg-view" id="pg-tree" hidden></div>
<div class="pg-view" id="pg-mutations" hidden></div>
<pre class="pg-view" id="pg-js" hidden><code class="language-javascript"></code></pre>
</div>
<div class="pg-messages" id="pg-messages" role="log" aria-label="Errors and console output" hidden></div>
</section>
</div>
<noscript><p class="pg-noscript">The playground compiles and runs components in the browser, so it needs JavaScript.</p></noscript>
</main>`;
