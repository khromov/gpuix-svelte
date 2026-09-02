/**
 * `experimental.customRenderer` is what makes the compiler emit
 * `import $renderer from 'gpuix-svelte/renderer'` and wrap the component in
 * `$.push_renderer($renderer)`.
 */

import { readFileSync } from 'node:fs';
import { Parser } from 'acorn';
import { compile, compileModule } from 'svelte/compiler';
import { parse_css_text } from './style.js';

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
 * One compound selector: classes, at most one tag, and `:hover`/`:active`, which
 * map onto GPUI's native pseudo styles. There is no runtime to match anything else.
 *
 * @param {any} complex a `ComplexSelector` node
 * @returns {{ classes: string[], tag: string | null, pseudo: string | null } | null}
 */
function compile_selector(complex) {
	if (complex.children.length !== 1 || complex.children[0].combinator) return null;

	/** @type {string[]} */
	const classes = [];
	let tag = null;
	let pseudo = null;

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
 *
 * @param {any} css the `<style>` block's AST
 * @param {string} source
 * @param {string} path
 */
function extract_rules(css, source, path) {
	const rules = [];
	const refuse = (text) =>
		console.warn(`[gpuix-svelte] ${path}: \`${text}\` has no GPUI equivalent — only class and tag selectors, plus :hover/:active, reach GPUI`);

	for (const node of css.children) {
		if (node.type !== 'Rule') {
			refuse(`@${node.name} ${node.prelude}`.trim());
			continue;
		}

		const declarations = [];
		for (const child of node.block.children) {
			if (child.type === 'Declaration') declarations.push(`${child.property}: ${child.value}`);
			else refuse(source.slice(child.start, child.end).split('{')[0].trim() + ' { … } (nested)');
		}
		const style = parse_css_text(declarations.join('; '));

		for (const complex of node.prelude.children) {
			const selector = compile_selector(complex);
			if (selector === null) refuse(source.slice(complex.start, complex.end));
			else rules.push({ ...selector, style });
		}
	}

	return rules.sort((a, b) => weight(a) - weight(b));
}

const weight = (rule) => rule.classes.length * 2 + (rule.tag === null ? 0 : 1);

/**
 * @param {string} path absolute path to a `.svelte` file
 * @param {string} [query] the `?v=N` cache-buster `render_hot` appends, if any
 * @returns {string} compiled client-side JS
 */
export function compile_svelte(path, query) {
	const source = readFileSync(path, 'utf8');
	let scope = null;

	const { js, warnings, ast } = compile(source, {
		filename: path,
		generate: 'client',
		runes: true,
		modernAst: true,
		// The value returned here is the class the compiler stamps on every element a
		// selector matches, which is how the renderer finds the right sheet at runtime.
		cssHash: (args) => (scope = `svelte-${args.hash(args.css)}`),
		experimental: { customRenderer: RENDERER_MODULE }
	});

	for (const warning of warnings) {
		console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	let code = js.code;
	if (scope !== null && ast.css) {
		const rules = extract_rules(ast.css, source, path);
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
 * A `.svelte.js` module has runes but no template, so it needs neither the renderer
 * import nor a cache-buster: it is loaded once and shared, which is what lets its
 * state outlive a hot remount.
 *
 * @param {string} path absolute path to a `.svelte.js` file
 * @returns {string} compiled JS
 */
export function compile_module(path) {
	const { js, warnings } = compileModule(readFileSync(path, 'utf8'), { filename: path, generate: 'client' });

	for (const warning of warnings) {
		console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	return js.code;
}
