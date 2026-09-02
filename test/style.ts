/**
 * A known GPUI style key handed a string it can't parse throws out of
 * `applyBatch`, which loses the frame and kills the loop that calls it. CSS
 * shorthands are the common way to trip that, so they expand here instead.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { renderer, parse_css_text, build_style, set_native, create_root, commit } from 'gpuix-svelte';
import { check, finish } from 'gpuix-svelte/test';

check('padding expands to four longhands', parse_css_text('padding: 12px 24px'), {
	paddingTop: 12,
	paddingRight: 24,
	paddingBottom: 12,
	paddingLeft: 24
});
check('margin takes all four values', parse_css_text('margin: 1px 2px 3px 4px'), {
	marginTop: 1,
	marginRight: 2,
	marginBottom: 3,
	marginLeft: 4
});
check('three values fill left from right', parse_css_text('padding: 1px 2px 3px'), {
	paddingTop: 1,
	paddingRight: 2,
	paddingBottom: 3,
	paddingLeft: 2
});
check('border-radius uses corner order', parse_css_text('border-radius: 4px 8px'), {
	borderTopLeftRadius: 4,
	borderTopRightRadius: 8,
	borderBottomRightRadius: 4,
	borderBottomLeftRadius: 8
});
check('gap splits row before column', parse_css_text('gap: 10px 20px'), {
	rowGap: 10,
	columnGap: 20
});
check('inset expands even when single', parse_css_text('inset: 0'), {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0
});

check('single values keep GPUI shorthand', parse_css_text('padding: 12px; gap: 8px'), {
	padding: 12,
	gap: 8
});
check('leading dot and plus coerce', parse_css_text('padding-left: .5px; top: +5px'), {
	paddingLeft: 0.5,
	top: 5
});
check('keywords, percents and colors stay strings', parse_css_text('width: 50%; height: auto; background-color: #1e1e2e'), {
	width: '50%',
	height: 'auto',
	backgroundColor: '#1e1e2e'
});
check('negative lengths survive', parse_css_text('margin-top: -4px'), { marginTop: -4 });
// GPUI reads longhands over the shorthand, so the later shorthand has to clear them.
check('a later shorthand clears the earlier longhands', parse_css_text('padding: 12px 24px; padding: 20px'), { padding: 20 });
check(
	'across rules and inline style too',
	build_style({ style: 'gap: 3px' }, [{ pseudo: null, style: parse_css_text('padding: 12px 24px; gap: 1px 2px') }, { pseudo: null, style: { padding: 20 } }]),
	{ padding: 20, gap: 3 }
);
check('while a later longhand still refines the shorthand', parse_css_text('padding: 20px; padding-top: 4px'), { padding: 20, paddingTop: 4 });

console.log('\n-- the next lines should each warn once --');
check('unsupported unit is dropped, not shipped', parse_css_text('font-size: 1rem'), {});
check('multi-value box-shadow is dropped', parse_css_text('box-shadow: 0 2px 4px rgba(0,0,0,.2)'), {});
// GPUI types these as bare `f64`, so `auto` and `%` are just as fatal as `1rem`.
check('auto never reaches a pixel-only key', parse_css_text('margin: 0 auto'), {
	marginTop: 0,
	marginBottom: 0
});
check('percent never reaches a pixel-only key', parse_css_text('border-radius: 50%; top: 50%'), {});
check('the slash form of border-radius is dropped', parse_css_text('border-radius: 10px / 20px'), {
	borderTopLeftRadius: 10,
	borderBottomRightRadius: 20
});
check('box-shadow keywords are dropped too', parse_css_text('box-shadow: none'), {});
check('percent still works where GPUI takes one', parse_css_text('max-width: 80%'), {
	maxWidth: '80%'
});

// The whole point: none of this may reach Rust as a string it will reject.
const native = new TestGpuixRenderer(400, 200);
set_native(native);
const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const box = renderer.createElement('div');
renderer.setAttribute(
	box,
	'style',
	'padding: 12px 24px; border-radius: 4px 8px; font-size: 1rem; margin: 0 auto; box-shadow: none'
);
renderer.insert(root, box, anchor);
const label = renderer.createElement('text');
renderer.setText(label, 'X');
renderer.insert(box, label, null);

let threw = null;
try {
	commit();
} catch (error) {
	threw = error;
}
check('commit survives a shorthand-heavy style', threw && threw.message, null);

native.flush();
const box_bounds = native.getElementBounds(label.nativeId);
check('padding actually applied (x, y)', box_bounds && box_bounds.slice(0, 2).map(Math.round), [24, 12]);

finish('style');
