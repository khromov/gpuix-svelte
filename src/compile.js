/**
 * `experimental.customRenderer` is what makes the compiler emit
 * `import $renderer from 'gpuix-svelte/renderer'` and wrap the component in
 * `$.push_renderer($renderer)`.
 */

import { readFileSync } from 'node:fs';
import { Parser } from 'acorn';
import { compile } from 'svelte/compiler';

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

/** The only nodes that carry a module specifier; a string that merely looks like one does not. */
const SPECIFIER_NODES = new Set([
	'ImportDeclaration',
	'ImportExpression',
	'ExportAllDeclaration',
	'ExportNamedDeclaration'
]);

/**
 * @param {string} code compiled component JS
 * @param {string} query the `?v=N` cache-buster to append
 * @returns {string} the same code, with every child `.svelte` specifier busted
 */
function bust_child_specifiers(code, query) {
	/** @type {number[]} */
	const closing_quotes = [];

	/** @param {any} node */
	function scan(node) {
		// A computed `import(expr)` has no literal to rewrite, and never had one.
		if (SPECIFIER_NODES.has(node.type) && node.source?.type === 'Literal') {
			if (String(node.source.value).endsWith('.svelte')) closing_quotes.push(node.source.end - 1);
		}

		for (const key in node) {
			const child = node[key];
			if (Array.isArray(child)) {
				for (const item of child) if (item?.type) scan(item);
			} else if (child?.type) {
				scan(child);
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
 * @param {string} path absolute path to a `.svelte` file
 * @param {string} [query] the `?v=N` cache-buster `render_hot` appends, if any
 * @returns {string} compiled client-side JS
 */
export function compile_svelte(path, query) {
	const { js, warnings } = compile(readFileSync(path, 'utf8'), {
		filename: path,
		generate: 'client',
		runes: true,
		experimental: { customRenderer: RENDERER_MODULE }
	});

	for (const warning of warnings) {
		console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	// Propagate the cache-buster to child components, or a reload would
	// re-instantiate the root against stale children.
	return query ? bust_child_specifiers(js.code, query) : js.code;
}
