import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{ files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: ts.parser } } },
	{ languageOptions: { globals: { ...globals.node, Bun: 'readonly' } } },
	{ ignores: ['**/node_modules', 'dist', 'vendor', 'starter', 'test/.samples-tmp', 'examples/second-brain/.data'] }
);
