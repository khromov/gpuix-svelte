import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{ files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: ts.parser } } },
	{
		languageOptions: { globals: { ...globals.node, Bun: 'readonly' } },
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-irregular-whitespace': ['error', { skipRegExps: true }],
			'no-useless-assignment': 'off',
			'svelte/require-each-key': 'off',
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{ ignores: ['**/node_modules', 'dist', 'vendor', 'test/.samples-tmp', 'examples/second-brain/.data'] }
);
