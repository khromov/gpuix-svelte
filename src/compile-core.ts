/**
 * The compile step itself, with no `node:*` import and no `process`, so the docs' playground can
 * run it in a browser; `compile.ts` adds the file read and `render_hot`'s cache-buster.
 */

import { compile, type AST } from 'svelte/compiler';
import { parse_css_text } from './style.ts';
import type { ClassRule, Pseudo } from './types.ts';

type Warn = (message: string) => void;

type Selector = Pick<ClassRule, 'classes' | 'tag' | 'pseudo'>;

const PSEUDOS = new Map<string, Pseudo>([
	['hover', 'hover'],
	['active', 'active'],
	['focus-visible', 'focusVisible']
]);

/**
 * One compound selector: classes, at most one tag, and `:hover`/`:active`/`:focus-visible`,
 * which map onto GPUI's native pseudo styles. There is no runtime to match anything else.
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
		} else if (s.type === 'PseudoClassSelector' && s.args === null && pseudo === null && PSEUDOS.has(s.name)) {
			pseudo = PSEUDOS.get(s.name) ?? null;
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
function extract_rules(css: AST.CSS.StyleSheet, source: string, path: string, warn: Warn): ClassRule[] {
	const rules: ClassRule[] = [];
	const refuse = (text: string) =>
		warn(`[gpuix-svelte] ${path}: \`${text}\` has no GPUI equivalent — only class and tag selectors, plus :hover/:active/:focus-visible, reach GPUI`);

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

/** Compiles a component's source to client JS for the custom renderer imported from `renderer_module`. */
export function compile_source(source: string, path: string, renderer_module: string, warn: Warn = console.warn): string {
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
		experimental: { customRenderer: renderer_module, async: true }
	});

	for (const warning of warnings) {
		warn(`[gpuix-svelte] ${path}: ${warning.message}`);
	}

	let code = js.code;
	if (scope !== null && ast.css) {
		const rules = extract_rules(ast.css as AST.CSS.StyleSheet, source, path, warn);
		if (rules.length > 0) {
			code += `\nimport { define_styles as $define_styles } from ${JSON.stringify(renderer_module)};\n`;
			code += `$define_styles(${JSON.stringify(scope)}, ${JSON.stringify(rules)});\n`;
		}
	}

	return code;
}
