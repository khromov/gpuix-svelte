/**
 * Headless smoke test: mount Counter.svelte into GPUI's test renderer, which
 * runs the real Metal pipeline without opening a window. This is where
 * anchor-projection bugs show up, so it runs before the windowed app.
 */

import { existsSync, statSync } from 'node:fs';
import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import '../src/plugin.js';
import renderer, { set_native, create_root, commit, dispatch } from '../src/renderer.js';

const native = new TestGpuixRenderer();
set_native(native);

const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const Counter = (await import('../examples/counter/Counter.svelte')).default;
mount(Counter, { renderer, target: root, anchor, props: {} });
flushSync();
commit();
native.flush();

const tree = JSON.parse(native.getTreeJson());

let elements = 0;
let texts = 0;
let blanks = 0;

(function walk(n) {
	if (!n) return;
	if (n.type === 'text') {
		texts++;
		if ((n.text ?? '').trim() === '') blanks++;
	} else {
		elements++;
	}
	for (const c of n.children ?? []) walk(c);
})(tree);

console.log(`elements=${elements} textNodes=${texts} blankTextNodes=${blanks}`);
console.log('text:', JSON.stringify(native.getAllText()));

// --- interact -------------------------------------------------------------

function findText(content) {
	let found = null;
	(function walk(n) {
		if (!n || found !== null) return;
		if (n.type === 'text' && n.text === content) found = n.id;
		for (const c of n.children ?? []) walk(c);
	})(JSON.parse(native.getTreeJson()));
	return found;
}

/** The clickable ancestor is the div holding the text node. */
function parentOf(id) {
	let found = null;
	(function walk(n, parent) {
		if (!n || found !== null) return;
		if (n.id === id) found = parent;
		for (const c of n.children ?? []) walk(c, n);
	})(JSON.parse(native.getTreeJson()), null);
	return found;
}

const plusText = findText('+');
const plusDiv = parentOf(parentOf(plusText).id); // text -> inner div -> button div
console.log('plus button id:', plusDiv?.id);

for (let i = 0; i < 3; i++) {
	dispatch({ elementId: plusDiv.id, eventType: 'click' });
	flushSync();
	commit();
	native.flush();
}
console.log('after 3 clicks:', JSON.stringify(native.getAllText()));

const betaDiv = parentOf(parentOf(findText('beta')).id);
dispatch({ elementId: betaDiv.id, eventType: 'click' });
flushSync();
commit();
native.flush();
console.log('after removing beta:', JSON.stringify(native.getAllText()));

const addDiv = parentOf(findText('add'));
for (let i = 0; i < 2; i++) {
	dispatch({ elementId: addDiv.id, eventType: 'click' });
	flushSync();
	commit();
	native.flush();
}
console.log('after 2 adds:', JSON.stringify(native.getAllText()));

const shot = '/tmp/gpuix-svelte-headless.png';
native.captureScreenshot(shot);
console.log('screenshot:', shot);

// --- assertions -------------------------------------------------------------

let failed = 0;
const check = (ok, msg) => {
	if (!ok) {
		failed++;
		console.error('FAIL', msg);
	}
};

const finalText = native.getAllText();
check(blanks === 0, `${blanks} blank text nodes reached GPUI`);
check(finalText.includes('3'), 'count did not reach 3 after 3 clicks');
check(
	finalText.includes('3 clicks — the {#if} branch is live'),
	'{#if} status line missing'
);
check(!finalText.includes('beta'), '"beta" still present after removal');
check(
	finalText.includes('eta') && finalText.includes('theta'),
	'added rows missing'
);
check(existsSync(shot) && statSync(shot).size > 0, `screenshot missing or empty: ${shot}`);

process.exit(failed === 0 ? 0 : 1);
