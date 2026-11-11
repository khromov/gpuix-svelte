/**
 * A static attribute reaches the renderer as text, and native ignores a prop whose JSON type is
 * wrong, so `showLineNumbers` and `minRows="6"` did nothing until the renderer coerced them.
 */

import { mount_headless, find_test_id, bounds, settle, check, finish, type TreeNode } from 'gpuix-svelte/test';

const warnings: string[] = [];
const warn = console.warn;
console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));

const Props = (await import('./Props.svelte')).default;
const { component } = mount_headless(Props, { width: 600, height: 400 });

const props = (id: string) => (find_test_id(id) as (TreeNode & { customProps?: Record<string, unknown> }) | null)?.customProps ?? {};
const height = (id: string) => bounds(find_test_id(id)!)?.height ?? 0;

check('a bare showLineNumbers reaches native as true', props('lines-bare').showLineNumbers, true);
check('and showLineNumbers="false" as false', props('lines-false').showLineNumbers, false);
check('minRows="6" as the number', props('rows-text').minRows, 6);
check(
	'so the field is as tall as minRows={6} makes it, and taller than one without',
	[height('rows-text') === height('rows-number'), height('rows-text') > height('rows-none')],
	[true, true]
);
check('readonly, as HTML spells it, reaches native as readOnly', props('readonly'), { readOnly: true });
check('diff takes its flags and its count', [props('diff').wordDiff, props('diff').scroll, props('diff').maxLines], [true, false, 5]);
check('so does a virtual list', [props('list').followTail, props('list').estimatedItemHeight], [true, 20]);
check(
	'and an anchored layer',
	[props('layer').priority, props('layer').occlude, props('layer').deferred, props('layer').snapMargin],
	[2, false, true, 8]
);

check("a value that is no number is left unset, beside the field's good one", ['maxRows' in props('rows-live'), props('rows-live').minRows], [false, 6]);
check('and is warned about once, however many fields have it', warnings.filter((w) => w.includes('maxRows')), ['[gpuix-svelte] maxRows="many" is not a number, so it is left unset']);

const { set_rows } = component as unknown as { set_rows(value: unknown): void };
set_rows('2');
settle();
check('a string that changes later is coerced too', props('rows-live').minRows, 2);
set_rows('');
settle();
check('and a blank one leaves the prop unset rather than 0', 'minRows' in props('rows-live'), false);
console.warn = warn;

finish('props', 12);
