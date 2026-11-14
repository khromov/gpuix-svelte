/**
 * The compile step itself, with no `node:*` import and no `process`, so the docs' playground can
 * run it in a browser; `compile.ts` adds the file read and `render_hot`'s cache-buster.
 */

import { compile, parse, type AST } from 'svelte/compiler';
import { IMPORTANT, parse_css_text } from './style.ts';
import { MEDIA_FEATURES, media_constant, parse_media_query } from './media.ts';
import type { ClassRule, Pseudo, RootRule } from './types.ts';

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

/** Svelte leaves a lone `:root` global in the DOM build, with or without `:global()` around it, so both spellings declare variables. */
function is_root(complex: AST.CSS.ComplexSelector): boolean {
	if (complex.children.length !== 1 || complex.children[0].combinator) return false;
	const [only, ...rest] = complex.children[0].selectors;
	if (rest.length > 0 || only?.type !== 'PseudoClassSelector') return false;
	if (only.name === 'root') return only.args === null;
	return only.name === 'global' && only.args?.children.length === 1 && is_root(only.args.children[0]);
}

function root_rule(declared: Array<[string, string]>, media: string[]): RootRule {
	const vars: Record<string, string> = {};
	const important: Record<string, string> = {};
	for (const [name, value] of declared) {
		if (IMPORTANT.test(value)) important[name] = value.replace(IMPORTANT, '');
		else vars[name] = value;
	}
	return { vars, ...(Object.keys(important).length > 0 && { important }), ...(media.length > 0 && { media }) };
}

/**
 * Class rules weakest first, so the renderer can apply them in order and let later ones win: classes over
 * tags, as CSS specificity has it, then source order, which is all that ranks the `:root` rules.
 */
function extract_rules(css: AST.CSS.StyleSheet, source: string, path: string, warn: Warn): { rules: ClassRule[]; root: RootRule[] } {
	const rules: ClassRule[] = [];
	const root: RootRule[] = [];
	const refuse = (text: string, reason = 'only class and tag selectors, plus :hover/:active/:focus-visible, reach GPUI') =>
		warn(`[gpuix-svelte] ${path}: \`${text}\` has no GPUI equivalent — ${reason}`);

	// A rule inside `@media` carries the query; one nested deeper carries every query on the way down. A query no
	// size can change is settled here: `screen` leaves its rules unconditional, `print` drops them.
	const walk = (children: Array<AST.CSS.Declaration | AST.CSS.Rule | AST.CSS.Atrule>, media: string[]) => {
		for (const node of children) {
			if (node.type === 'Declaration') continue;
			if (node.type === 'Atrule') {
				const prelude = node.prelude.trim();
				const list = node.name === 'media' ? parse_media_query(prelude) : null;
				if (node.name !== 'media') refuse(`@${node.name} ${prelude}`.trim());
				else if (!node.block || list === null) refuse(`@media ${prelude}`, `a window answers only for ${MEDIA_FEATURES}`);
				else {
					const constant = media_constant(list);
					if (constant !== false) walk(node.block.children, constant === true ? media : [...media, prelude]);
				}
				continue;
			}

			const declarations: string[] = [];
			const properties: string[] = [];
			const variables: Array<[string, string]> = [];
			for (const child of node.block.children) {
				if (child.type !== 'Declaration') refuse(source.slice(child.start, child.end).split('{')[0].trim() + ' { … } (nested)');
				else if (child.property.startsWith('--')) variables.push([child.property.slice(2), child.value]);
				else {
					declarations.push(`${child.property}: ${child.value}`);
					properties.push(child.property);
				}
			}
			const css = declarations.join('; ');
			// A `var()` only resolves at runtime, so a block that reads one ships as text.
			const body = css.includes('var(') ? { css } : { style: parse_css_text(css) };
			const vars = Object.fromEntries(variables.map(([name, value]) => [name, value.replace(IMPORTANT, '')]));
			const names = variables.map(([name]) => `--${name}`).join('; ');

			for (const complex of node.prelude.children) {
				const text = source.slice(complex.start, complex.end);
				if (is_root(complex)) {
					// A browser styles `<html>` with these, and a window has no element above the app's own root.
					if (properties.length > 0) refuse(`${text} { ${properties.join('; ')} }`, 'only the variables (`--name`) a `:root` rule declares reach GPUI');
					if (variables.length > 0) root.push(root_rule(variables, media));
					continue;
				}
				const selector = compile_selector(complex);
				if (selector === null) {
					refuse(text, text.includes(':root') ? 'only a `:root` on its own declares variables, and set_css_vars() switches them at runtime' : undefined);
					continue;
				}
				// The three states are native, so nothing here learns of one in time to restyle what reads the variable.
				const scoped = variables.length > 0 && selector.pseudo === null;
				if (variables.length > 0 && !scoped) refuse(`${text} { ${names} }`, 'an element can declare a variable, but not only while it is hovered, pressed or focused');
				if (declarations.length === 0 && variables.length > 0 && !scoped) continue;
				rules.push({ ...selector, ...body, ...(scoped && { vars }), ...(media.length > 0 && { media }) });
			}
		}
	};
	walk(css.children, []);

	return { rules: rules.sort((a, b) => weight(a) - weight(b)), root };
}

const weight = (rule: ClassRule) => rule.classes.length * 2 + (rule.tag === null ? 0 : 1);

/** Elements whose text HTML keeps as written, or reads as something other than text. */
const PREFORMATTED = new Set(['pre', 'textarea', 'script', 'style']);

/** What the compiler takes out of a fragment before it decides which of a text's edges touch an expression. */
const UNSEEN = new Set(['Comment', 'ConstTag', 'DeclarationTag', 'DebugTag', 'SnippetBlock', 'SvelteHead', 'TitleElement', 'SvelteWindow', 'SvelteBody', 'SvelteDocument']);

type TemplateNode = { type?: string; name?: string; start: number; end: number; nodes?: TemplateNode[] };

/**
 * Collapses the whitespace inside the template's text the way an HTML parser does, since GPUI draws
 * a text node as written and a sentence wrapped in the markup would show its line break and
 * indentation. A run with a line break moves into a comment, which the compiler drops, so every
 * line keeps its number in errors and warnings. Strings from expressions are not touched, and
 * `<svelte:options preserveWhitespace />` turns it off for the component.
 */
export function collapse_whitespace(source: string): string {
	let fragment: unknown;
	try {
		const root = parse(source, { modern: true });
		if (root.options?.preserveWhitespace) return source;
		fragment = root.fragment;
	} catch {
		// The compile reports it, against the source as written.
		return source;
	}

	const edits: Array<[number, number, string]> = [];
	const visit = (value: unknown, preformatted: boolean) => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item, preformatted);
			return;
		}
		if (value === null || typeof value !== 'object') return;
		const node = value as TemplateNode;
		if (node.type === 'Fragment' && !preformatted) {
			const nodes = (node.nodes ?? []).filter((child) => !UNSEEN.has(child.type ?? ''));
			nodes.forEach((child, i) => {
				if (child.type !== 'Text') return;
				const text = source.slice(child.start, child.end);
				// HTML's whitespace and the compiler's, not `\s`: a no-break space is content.
				for (const run of text.matchAll(/[ \t\r\n]+/g)) {
					// The compiler trims and collapses a text's edges itself, except against an expression.
					const leads = run.index === 0 && nodes[i - 1]?.type !== 'ExpressionTag';
					const trails = run.index + run[0].length === text.length && nodes[i + 1]?.type !== 'ExpressionTag';
					if (run[0] === ' ' || leads || trails) continue;
					const at = child.start + run.index;
					edits.push([at, at + run[0].length, /[\r\n]/.test(run[0]) ? `<!--${run[0]}--> ` : ' ']);
				}
			});
		}
		const inside = preformatted || (node.type === 'RegularElement' && PREFORMATTED.has(node.name ?? ''));
		for (const key in node) visit((node as unknown as Record<string, unknown>)[key], inside);
	};
	visit(fragment, false);

	let out = source;
	for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
	return out;
}

/** A file's `:root` rules replace the ones it declared before, so they are keyed by its path, hashed to keep the build machine's out of a shipped app. */
function file_key(path: string) {
	let hash = 5381;
	for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
	return (hash >>> 0).toString(36);
}

/**
 * Compiles a component's source to client JS for the custom renderer imported from `renderer_module`.
 * `hot` says the module is evaluated again on every reload, so `:root` rules it stops declaring go away with one.
 */
export function compile_source(source: string, path: string, renderer_module: string, warn: Warn = console.warn, hot = false): string {
	let scope = null as string | null;
	source = collapse_whitespace(source);

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
		const { rules, root } = extract_rules(ast.css as AST.CSS.StyleSheet, source, path, warn);
		if (rules.length > 0) {
			code += `\nimport { define_styles as $define_styles } from ${JSON.stringify(renderer_module)};\n`;
			code += `$define_styles(${JSON.stringify(scope)}, ${JSON.stringify(rules)});\n`;
		}
		if (root.length > 0) {
			code += `\nimport { define_root_vars as $define_root_vars } from ${JSON.stringify(renderer_module)};\n`;
			code += `$define_root_vars(${JSON.stringify(file_key(path))}, ${JSON.stringify(root)}${hot ? ', true' : ''});\n`;
		}
	}

	return code;
}
