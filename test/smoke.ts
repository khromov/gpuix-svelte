/**
 * The test renderer runs the real Metal pipeline without opening a window, which is
 * where anchor-projection bugs show up, so this runs before the windowed app.
 */

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mount_headless, tree, click_text, all_text, painted, screenshot, check, finish, type TreeNode } from 'gpuix-svelte/test';

const Counter = (await import('../examples/counter/Counter.svelte')).default;
mount_headless(Counter);

let elements = 0;
let texts = 0;
let blanks = 0;

function walk(n: TreeNode | null | undefined) {
	if (!n) return;
	if (n.type === 'text') {
		texts++;
		if ((n.text ?? '').trim() === '') blanks++;
	} else {
		elements++;
	}
	for (const c of n.children ?? []) walk(c);
}

walk(tree());

console.log(`elements=${elements} textNodes=${texts} blankTextNodes=${blanks}`);
console.log('text:', JSON.stringify(all_text()));

for (let i = 0; i < 3; i++) click_text('+');
console.log('after 3 clicks:', JSON.stringify(all_text()));

click_text('beta');
console.log('after removing beta:', JSON.stringify(all_text()));

for (let i = 0; i < 2; i++) click_text('add');
console.log('after 2 adds:', JSON.stringify(all_text()));

// A directory of its own, because a fixed path would still hold an earlier run's file.
const shot_dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-smoke-'));
const shot = screenshot(join(shot_dir, 'headless.png'));
console.log('screenshot:', shot);

// Again now, since the rows and the {#if} branch only arrived after the mount.
walk(tree());

const final_text = all_text();
const final_paint = painted().split('\n');
check('no blank text node reached GPUI', blanks, 0);
check('count reached 3 after 3 clicks', final_text.includes('3'));
check('the {#if} status line is live', final_text.includes('3 clicks — the {#if} branch is live'));
check('"beta" is gone after removal', final_text.includes('beta'), false);
check('added rows are painted', final_paint.includes('eta') && final_paint.includes('theta'));
check('screenshot written', existsSync(shot) && statSync(shot).size > 0);

rmSync(shot_dir, { recursive: true, force: true });

finish('smoke', 6);
