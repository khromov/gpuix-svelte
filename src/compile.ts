/**
 * `experimental.customRenderer` is what makes the compiler emit
 * `import $renderer from 'gpuix-svelte/renderer'` and wrap the component in
 * `$.push_renderer($renderer)`.
 */

import { readFileSync } from 'node:fs';
import { Parser, type Node as AcornNode } from 'acorn';
import { compileModule } from 'svelte/compiler';
import { compile_source } from './compile-core.ts';

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

/**
 * The registry's svelte carries the same version number as the custom-renderer build this
 * package bundles, so the loaders check for the API itself.
 */
export const WRONG_SVELTE =
	'[gpuix-svelte] svelte resolved to a build without the custom-renderer API. gpuix-svelte bundles the build it needs — remove svelte from your own dependencies and reinstall.';

/** The only nodes that carry a module specifier; a string that merely looks like one does not. */
const SPECIFIER_NODES = new Set([
	'ImportDeclaration',
	'ImportExpression',
	'ExportAllDeclaration',
	'ExportNamedDeclaration'
]);

type SpecifierNode = AcornNode & { source?: (AcornNode & { type: string; value: unknown }) | null };

/** The same compiled component JS, with every child `.svelte` specifier carrying the `?v=N` cache-buster. */
function bust_child_specifiers(code: string, query: string): string {
	const closing_quotes: number[] = [];

	function scan(node: AcornNode) {
		// A computed `import(expr)` has no literal to rewrite, and never had one.
		const source = SPECIFIER_NODES.has(node.type) ? (node as SpecifierNode).source : undefined;
		if (source?.type === 'Literal') {
			const value = String(source.value);
			// A bare specifier can't carry a query (Node refuses `pkg/x.svelte?v=1`), and a
			// package component is not what is being edited anyway.
			if (value.endsWith('.svelte') && /^(\.|\/|file:)/.test(value)) closing_quotes.push(source.end - 1);
		}

		for (const key in node) {
			const child = (node as unknown as Record<string, unknown>)[key];
			if (Array.isArray(child)) {
				for (const item of child) if ((item as AcornNode | null)?.type) scan(item as AcornNode);
			} else if ((child as AcornNode | null)?.type) {
				scan(child as AcornNode);
			}
		}
	}

	scan(Parser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }));

	// Back to front, so a splice never shifts an offset still to come.
	let out = code;
	for (const at of closing_quotes.sort((a, b) => b - a)) {
		out = out.slice(0, at) + query + out.slice(at);
	}
	return out;
}

/**
 * Compiles the `.svelte` file at `path` to client JS; `query` is the `?v=N` cache-buster `render_hot` appends, if any.
 * `hot` is for a loader whose reloads reach the module without one.
 */
export function compile_svelte(path: string, query?: string, hot = Boolean(query)): string {
	const code = compile_source(readFileSync(path, 'utf8'), path, RENDERER_MODULE, console.warn, hot);

	// Propagate the cache-buster to child components, or a reload would
	// re-instantiate the root against stale children.
	return query ? bust_child_specifiers(code, query) : code;
}

/**
 * A `.svelte.ts` module has runes but no template, so it needs neither the renderer
 * import nor a cache-buster: it is loaded once and shared, which is what lets its
 * state outlive a hot remount. `source` is passed in when a loader has already
 * stripped the types, since `compileModule` does not.
 */
export function compile_module(path: string, source: string = readFileSync(path, 'utf8')): string {
	const { js, warnings } = compileModule(source, { filename: path, generate: 'client' });

	for (const warning of warnings) {
		console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	return js.code;
}
