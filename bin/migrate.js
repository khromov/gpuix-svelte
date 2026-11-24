// @ts-check
/**
 * Brings the config of an app scaffolded while gpuix-svelte bundled its own svelte up to date, once.
 * It renames the old condition in tsconfig.json's customConditions, deletes the two `paths` entries
 * the starter pointed at the bundled copy (only while nothing else shares that `paths`), and replaces
 * the two AGENTS.md passages the starter wrote word for word, so anything else the app wrote stays.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @type {Array<[string, string]>} */
const AGENTS = [
	[
		'`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves\nevery `svelte` import to it. Keep `svelte` itself out of `package.json`.',
		'`svelte` is a peer dependency of `gpuix-svelte`, 5.59.1 or later, so the app, svelte-check and the\nrenderer all run on one copy of it.'
	],
	['--conditions custom-renderer --conditions development', '--conditions svelte-custom-renderer --conditions development']
];

const NESTED_PATHS =
	/,\s*"paths"\s*:\s*\{\s*"svelte"\s*:\s*\[\s*"\.\/node_modules\/gpuix-svelte\/node_modules\/svelte"\s*\]\s*,\s*"svelte\/\*"\s*:\s*\[\s*"\.\/node_modules\/gpuix-svelte\/node_modules\/svelte\/\*"\s*\]\s*,?\s*\}/;

/** @type {Record<string, (text: string) => string>} */
const EDITS = {
	'tsconfig.json': (text) => text.replace(/("customConditions"\s*:\s*\[[^\]]*?)"custom-renderer"/, '$1"svelte-custom-renderer"').replace(NESTED_PATHS, ''),
	'AGENTS.md': (text) => AGENTS.reduce((out, [from, to]) => out.replace(from, to), text)
};

/**
 * @param {string} dir
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]} the names of the files it changed
 */
export function migrate(dir, env = process.env) {
	// A CI checkout throws the change away, and would print the notice on every run.
	if (env.CI && env.CI !== 'false') return [];
	/** @type {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} */
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	} catch {
		return [];
	}
	if (!manifest.dependencies?.['gpuix-svelte'] && !manifest.devDependencies?.['gpuix-svelte']) return [];

	/** @type {string[]} */
	const changed = [];
	for (const [name, edit] of Object.entries(EDITS)) {
		const path = join(dir, name);
		try {
			const text = readFileSync(path, 'utf8');
			const crlf = text.includes('\r\n');
			const before = crlf ? text.replaceAll('\r\n', '\n') : text;
			const after = edit(before);
			if (after === before) continue;
			writeFileSync(path, crlf ? after.replaceAll('\n', '\r\n') : after);
			changed.push(name);
		} catch {
			// A missing or read-only file is left to the app.
		}
	}
	return changed;
}
