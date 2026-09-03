/**
 * `experimental.customRenderer` is what makes the compiler emit
 * `import $renderer from 'gpuix-svelte/renderer'` and wrap the component in
 * `$.push_renderer($renderer)`.
 */

import { readFileSync } from 'node:fs';
import { Parser, type Node as AcornNode } from 'acorn';
import { compile, compileModule, type AST } from 'svelte/compiler';
import { parse_css_text } from './style.ts';
import type { ClassRule, Pseudo } from './types.ts';

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

/**
 * The registry's svelte carries the same version number as the custom-renderer build this
 * package bundles, so the loaders check for the API rather than the version.
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

type Selector = Pick<ClassRule, 'classes' | 'tag' | 'pseudo'>;

/**
 * One compound selector: classes, at most one tag, and `:hover`/`:active`, which
 * map onto GPUI's native pseudo styles. There is no runtime to match anything else.
 */
function compile_selector(complex: AST.CSS.ComplexSelector): Selector | null {
	if (complex.children.length !== 1 || complex.children[0].combinator) return null;

	const classes: string[] = [];
	let tag: string | null = null;
	let pseudo: Pseudo = null;

	for (const s of complex.children[0].selectors) {
		if (s.type === 'ClassSelector') {
			classes.push(s.name);
		} else if (s.type === 'TypeSelector' && tag === null) {
			tag = s.name;
		} else if (s.type === 'PseudoClassSelector' && s.args === null && pseudo === null && (s.name === 'hover' || s.name === 'active')) {
			pseudo = s.name;
		} else {
			return null;
		}
	}

	return classes.length === 0 && tag === null ? null : { classes, tag, pseudo };
}

/**
 * Weakest first, so the renderer can apply them in order and let later ones win:
 * classes over tags, as CSS specificity has it, then source order.
 */
function extract_rules(css: AST.CSS.StyleSheet, source: string, path: string): ClassRule[] {
	const rules: ClassRule[] = [];
	const refuse = (text: string) =>
		console.warn(`[gpuix-svelte] ${path}: \`${text}\` has no GPUI equivalent — only class and tag selectors, plus :hover/:active, reach GPUI`);

	for (const node of css.children) {
		if (node.type !== 'Rule') {
			refuse(`@${node.name} ${node.prelude}`.trim());
			continue;
		}

		const declarations: string[] = [];
		for (const child of node.block.children) {
			if (child.type === 'Declaration') declarations.push(`${child.property}: ${child.value}`);
			else refuse(source.slice(child.start, child.end).split('{')[0].trim() + ' { … } (nested)');
		}
		const css = declarations.join('; ');
		// A `var()` only resolves at runtime, so a block that reads one ships as text.
		const body = css.includes('var(') ? { css } : { style: parse_css_text(css) };

		for (const complex of node.prelude.children) {
			const selector = compile_selector(complex);
			if (selector === null) refuse(source.slice(complex.start, complex.end));
			else rules.push({ ...selector, ...body });
		}
	}

	return rules.sort((a, b) => weight(a) - weight(b));
}

const weight = (rule: ClassRule) => rule.classes.length * 2 + (rule.tag === null ? 0 : 1);

/** Compiles the `.svelte` file at `path` to client JS; `query` is the `?v=N` cache-buster `render_hot` appends, if any. */
export function compile_svelte(path: string, query?: string): string {
	const source = readFileSync(path, 'utf8');
	let scope = null as string | null;

	const { js, warnings, ast } = compile(source, {
		filename: path,
		generate: 'client',
		runes: true,
		modernAst: true,
		// The value returned here is the class the compiler stamps on every element a
		// selector matches, which is how the renderer finds the right sheet at runtime.
		cssHash: (args) => (scope = `svelte-${args.hash(args.css)}`),
		// async is on because a `pending`/`failed` snippet in a <svelte:boundary> crashes the
		// compiler without it (SvelteBoundary.js reads through the `renderer_snippet` wrapper).
		experimental: { customRenderer: RENDERER_MODULE, async: true }
	});

	for (const warning of warnings) {
		console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	let code = js.code;
	if (scope !== null && ast.css) {
		const rules = extract_rules(ast.css as AST.CSS.StyleSheet, source, path);
		if (rules.length > 0) {
			code += `\nimport { define_styles as $define_styles } from ${JSON.stringify(RENDERER_MODULE)};\n`;
			code += `$define_styles(${JSON.stringify(scope)}, ${JSON.stringify(rules)});\n`;
		}
	}

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
