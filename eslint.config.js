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
	// The DOM build and what runs on it.
	{ files: ['src/dom.ts', 'src/components/dom/**', 'test/dom.ts', 'examples/cross-target/**'], languageOptions: { globals: { ...globals.browser } } },
	{ ignores: ['**/node_modules', 'dist', 'lib', 'vendor', 'starter', 'packages/*/template', 'docs/assets', 'test/.samples-tmp', 'test/.hot-tmp', 'test/.bundle-tmp', 'test/.dom-tmp', 'test/.ui-tmp'] }
);
