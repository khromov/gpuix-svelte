import { parse } from 'acorn';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Node } from 'acorn';

type Ast = Node & { type: string; [key: string]: unknown };

export function bundle_asset_urls(source: string, path: string, include: (path: string) => string): string {
	if (!source.includes('URL') || !source.includes('import.meta')) return source;
	const edits: Array<{ start: number; end: number; value: string }> = [];
	function visit(node: Ast) {
		if (node.type === 'NewExpression') {
			const callee = node.callee as Ast;
			const args = node.arguments as Ast[];
			const [file, base] = args;
			if (callee.type === 'Identifier' && callee.name === 'URL' && file?.type === 'Literal' && typeof file.value === 'string'
				&& base?.type === 'MemberExpression' && !base.computed && (base.object as Ast).type === 'MetaProperty' && (base.property as Ast).name === 'url'
				&& !/^[a-z][a-z\d+.-]*:/i.test(file.value) && !file.value.startsWith('/') && !file.value.endsWith('.svelte')) {
				const url = new URL(file.value, pathToFileURL(resolve(path)));
				const asset = fileURLToPath(url);
				if (statSync(asset, { throwIfNoEntry: false })?.isDirectory()) return;
				const name = include(asset);
				edits.push({ start: node.start, end: node.end, value: `new URL(globalThis.gpuixHost.assetUrl(${JSON.stringify(name)}) + ${JSON.stringify(url.search + url.hash)})` });
				return;
			}
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const child of value) if (child?.type) visit(child as Ast);
			} else if (value && typeof value === 'object' && 'type' in value) visit(value as Ast);
		}
	}
	visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Ast);
	for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
	return source;
}
