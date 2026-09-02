/**
 * A `.svelte.js` module is where Svelte 5 keeps shared runes state. The loaders
 * have to compile it, and it has to be the same instance for the component that
 * renders it and the code that imports it directly.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit, dispatch } from '../src/renderer.js';
import { store, bump } from './ModuleStore.svelte.js';

const native = new TestGpuixRenderer();
set_native(native);

const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const ModuleUser = (await import('./ModuleUser.svelte')).default;
mount(ModuleUser, { renderer, target: root, anchor, props: {} });
flushSync();
commit();
native.flush();

let failures = 0;

function check(label, actual, expected) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`);
}

function find_parent_of_text(content) {
	let found = null;
	(function walk(n, parent) {
		if (!n || found !== null) return;
		if (n.type === 'text' && n.text === content) found = parent;
		for (const c of n.children ?? []) walk(c, n);
	})(JSON.parse(native.getTreeJson()), null);
	return found;
}

check('initial render reads the module state', native.getAllText().includes('count is 0'), true);

dispatch({ elementId: find_parent_of_text('bump').id, eventType: 'click' });
flushSync();
commit();
native.flush();

check('a click through the component updates the painted text', native.getAllText().includes('count is 1'), true);
check('the test sees the same module instance', store.count, 1);

bump();
flushSync();
commit();
native.flush();

check('a direct mutation re-renders the component', native.getAllText().includes('count is 2'), true);

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nmodule ok');
