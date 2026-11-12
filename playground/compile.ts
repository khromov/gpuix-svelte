/**
 * The playground's compiler, run in the page: the package's own compile step for GPUI, Svelte's
 * for the DOM, and then the imports of either pointed at the modules the frame was built with.
 */

import { Parser, type Node as AcornNode } from 'acorn';
import { compile } from 'svelte/compiler';
import { compile_source } from '../src/compile-core.ts';
import { forget_style_warnings } from '../src/style.ts';
import { MODULES, file_of, type Target } from './modules.ts';

const FILE = 'App.svelte';

export interface Compiled {
	/** What the compiler emitted, for reading. */
	code: string;
	/** The same module with its imports resolved, for a frame at `base` to import. */
	runnable: string;
	warnings: string[];
}

export interface Problem {
	message: string;
	line: number | null;
}

type SourceNode = AcornNode & { source?: (AcornNode & { value?: unknown }) | null };

const IMPORTS = new Set(['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration', 'ExportNamedDeclaration']);

/** `base` is the directory the frames were built into, as a URL ending in a slash. */
export function link(code: string, target: Target, base: string): string {
	const known = new Map(MODULES[target].map((m) => [m.specifier, new URL(`${target}/${file_of(m.specifier)}`, base).href]));
	const edits: Array<[number, number, string]> = [];

	const scan = (node: AcornNode) => {
		if (IMPORTS.has(node.type)) {
			const source = (node as SourceNode).source;
			if (source && source.type !== 'Literal') throw new Error('The playground cannot follow a computed import().');
			if (source) {
				const url = known.get(String(source.value));
				if (!url) {
					throw new Error(`The playground cannot import "${String(source.value)}". Available here: ${visible(target).join(', ')}.`);
				}
				edits.push([source.start, source.end, JSON.stringify(url)]);
			}
		}
		for (const key in node) {
			const child = (node as unknown as Record<string, unknown>)[key];
			if (Array.isArray(child)) {
				for (const item of child) if ((item as AcornNode | null)?.type) scan(item as AcornNode);
			} else if ((child as AcornNode | null)?.type) {
				scan(child as AcornNode);
			}
		}
	};
	scan(Parser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }));

	let out = code;
	for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
	return out;
}

/** The modules a person would write an import for, without the compiler's own. */
export const visible = (target: Target) => MODULES[target].map((m) => m.specifier).filter((s) => !s.includes('/internal/') && s !== 'gpuix-svelte/renderer');

function compile_gpui(source: string, warnings: string[]): string {
	// A dropped style value is reported by style.ts on the console, once per property.
	const warn = console.warn;
	forget_style_warnings();
	console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
	try {
		return compile_source(source, FILE, 'gpuix-svelte/renderer', (message) => warnings.push(message));
	} finally {
		console.warn = warn;
	}
}

function compile_dom(source: string, warnings: string[]): string {
	const { js, warnings: found } = compile(source, { filename: FILE, generate: 'client', runes: true, css: 'injected' });
	for (const w of found) if (!w.code.startsWith('a11y_')) warnings.push(`${FILE}: ${w.message}`);
	return js.code;
}

export function compile_for(target: Target, source: string, base: string): Compiled {
	const warnings: string[] = [];
	const code = target === 'gpui' ? compile_gpui(source, warnings) : compile_dom(source, warnings);
	return { code, runnable: link(code, target, base), warnings: warnings.map((w) => w.replace('[gpuix-svelte] ', '')) };
}

/** Svelte's compile errors carry a position; anything else is only a message. */
export function problem_of(error: unknown): Problem {
	const e = error as { message?: string; start?: { line?: number } };
	return { message: e?.message ?? String(error), line: typeof e?.start?.line === 'number' ? e.start.line : null };
}
