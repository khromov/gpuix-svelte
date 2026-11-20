/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse } from 'acorn';
import { dirname, resolve } from 'node:path';

export function bundle_hot_entries(source: string, path: string): string {
	const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) as any;
	const hot_names = new Set<string>();
	const namespaces = new Set<string>();
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'gpuix-svelte') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'render_hot') hot_names.add(specifier.local.name);
			if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
		}
	}
	const edits: Array<{ start: number; end: number; value: string }> = [];
	const imports: string[] = [];
	function visit(node: any): void {
		if (!node || typeof node !== 'object') return;
		const callee = node.callee;
		const hot_call = callee?.type === 'Identifier' ? hot_names.has(callee.name)
			: callee?.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && namespaces.has(callee.object.name) && callee.property.name === 'render_hot';
		if (node.type === 'CallExpression' && hot_call) {
			const arg = node.arguments[0];
			let target: string | undefined;
			if (arg?.type === 'Literal' && typeof arg.value === 'string') target = arg.value;
			if (arg?.type === 'NewExpression' && arg.callee.type === 'Identifier' && arg.callee.name === 'URL' && arg.arguments[0]?.type === 'Literal' && typeof arg.arguments[0].value === 'string') target = arg.arguments[0].value;
			if (target === undefined) throw new Error(`[txiki] render_hot() in ${path} needs a literal component path; computed paths cannot be bundled for txiki.js`);
			const component = `__gpuix_txiki_component_${imports.length}`;
			const resolved = resolve(dirname(path), target).replace(/\\/g, '/');
			imports.push(`import ${component} from ${JSON.stringify(resolved)};`);
			edits.push({ start: arg.start, end: arg.end, value: component });
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end') continue;
			if (Array.isArray(value)) value.forEach(visit);
			else if (value && typeof value === 'object') visit(value);
		}
	}
	visit(ast);
	for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
	return `${imports.join('\n')}\n${source}`;
}
