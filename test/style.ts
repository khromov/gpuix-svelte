/**
 * A known GPUI style key handed a value it can't parse makes native refuse the
 * batch, and the element then loses that whole `setStyle`. CSS shorthands are the
 * common way to trip that, so they expand here instead.
 */

import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { renderer, parse_css_text, build_style, set_native, create_root, commit, set_css_vars } from 'gpuix-svelte';
import { compile_svelte } from '../src/compile.ts';
import { mount_headless, find_test_id, check, finish } from 'gpuix-svelte/test';

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
check('border-width expands like padding', parse_css_text('border-width: 1px 2px'), {
	borderTopWidth: 1,
	borderRightWidth: 2,
	borderBottomWidth: 1,
	borderLeftWidth: 2
});
check('five values are one too many for a box shorthand', parse_css_text('margin: 1px 2px 3px 4px 5px'), {});
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

check('native 0.11 pixel keys take lengths', parse_css_text('outline-width: 2px; outline-offset: 1px; scrollbar-width: 6px'), {
	outlineWidth: 2,
	outlineOffset: 1,
	scrollbarWidth: 6
});
check('aspect-ratio takes a ratio or a number', [parse_css_text('aspect-ratio: 16 / 8'), parse_css_text('aspect-ratio: 1.5')], [
	{ aspectRatio: 2 },
	{ aspectRatio: 1.5 }
]);
check('aspect-ratio drops a length rather than reading it as a ratio', parse_css_text('aspect-ratio: 16px'), {});
check('scrollbar-color keeps the thumb of a thumb-and-track pair', parse_css_text('scrollbar-color: rgb(1, 2, 3) #000'), {
	scrollbarColor: 'rgb(1, 2, 3)'
});
check('a nested pseudo style written as a declaration is dropped', parse_css_text('focus-visible: red; hover: red; active: red; color: blue'), {
	color: 'blue'
});
check(
	'keyboard-focus-dim becomes a bool, anything else is dropped',
	[parse_css_text('keyboard-focus-dim: false'), parse_css_text('keyboard-focus-dim: true'), parse_css_text('keyboard-focus-dim: maybe')],
	[{ keyboardFocusDim: false }, { keyboardFocusDim: true }, {}]
);

check('a number is dropped on a key native reads as a string, or it would reject the whole batch', parse_css_text('color: 123456; background: 0; background-color: 12px; display: 0; font-family: 12; position: 1rem'), {});
set_css_vars({ 'numeric-ink': 123456 });
check('a var() that resolves to one too', parse_css_text('color: var(--numeric-ink)'), {});
check(
	'font-weight is the one that takes either, though not a length',
	[parse_css_text('font-weight: 700'), parse_css_text('font-weight: bold'), parse_css_text('font-weight: 1em')],
	[{ fontWeight: 700 }, { fontWeight: 'bold' }, {}]
);
check('!important is stripped, or it would cost the declaration', parse_css_text('color: red !important; width: 12px !IMPORTANT; padding: 4px 8px!important'), {
	color: 'red',
	width: 12,
	paddingTop: 4,
	paddingRight: 8,
	paddingBottom: 4,
	paddingLeft: 8
});

check('single values keep GPUI shorthand', parse_css_text('padding: 12px; gap: 8px'), {
	padding: 12,
	gap: 8
});
check('a leading dot, a plus and an upper-case unit coerce', parse_css_text('padding-left: .5px; top: +5px; left: 2PX'), {
	paddingLeft: 0.5,
	top: 5,
	left: 2
});
check('keywords, percents and colors stay strings', parse_css_text('width: 50%; height: auto; background-color: #1e1e2e'), {
	width: '50%',
	height: 'auto',
	backgroundColor: '#1e1e2e'
});
check(
	'a ; inside quotes, parens or a comment stays in its value',
	parse_css_text(`font-family: "a;b"; color: rgb(1, 2, 3); background-color: url(x;y); border-color: 'c;d'; cursor: "e\\";f"; outline-color: g /* h;i */`),
	{
		fontFamily: '"a;b"',
		color: 'rgb(1, 2, 3)',
		backgroundColor: 'url(x;y)',
		borderColor: "'c;d'",
		cursor: '"e\\";f"',
		outlineColor: 'g /* h;i */'
	}
);
check('negative lengths survive', parse_css_text('margin-top: -4px'), { marginTop: -4 });
// GPUI reads longhands over the shorthand, so the later shorthand has to clear them.
check('a later shorthand clears the earlier longhands', parse_css_text('padding: 12px 24px; padding: 20px'), { padding: 20 });
check(
	'across rules and inline style too',
	build_style({ style: 'gap: 3px' }, [{ pseudo: null, style: parse_css_text('padding: 12px 24px; gap: 1px 2px') }, { pseudo: null, style: { padding: 20 } }]),
	{ padding: 20, gap: 3 }
);
check('while a later longhand still refines the shorthand', parse_css_text('padding: 20px; padding-top: 4px'), { padding: 20, paddingTop: 4 });

// Spellings GPUI would otherwise reject, or accept and ignore.
check('rem is 16 px, shorthands included', parse_css_text('padding: .5rem 1rem; gap: 0.5rem; margin-top: -1rem; width: 10REM'), {
	paddingTop: 8,
	paddingRight: 16,
	paddingBottom: 8,
	paddingLeft: 16,
	gap: 8,
	marginTop: -16,
	width: 160
});
check(
	'overflow: auto is scroll, on either axis, and hidden stays hidden',
	[parse_css_text('overflow: auto; overflow-y: auto; overflow-x: auto'), parse_css_text('overflow-x: hidden')],
	[{ overflow: 'scroll', overflowY: 'scroll', overflowX: 'scroll' }, { overflowX: 'hidden' }]
);
check('intrinsic sizes read as auto', parse_css_text('width: max-content; min-width: fit-content(200px); max-height: min-content; height: fit-content'), {
	width: 'auto',
	minWidth: 'auto',
	maxHeight: 'auto',
	height: 'auto'
});
set_css_vars({ 'style-pad': '0.5rem 1rem' });
check('a var() resolving to rem or auto gets the same treatment', parse_css_text('padding: var(--style-pad); overflow-y: var(--style-unset, auto)'), {
	paddingTop: 8,
	paddingRight: 16,
	paddingBottom: 8,
	paddingLeft: 16,
	overflowY: 'scroll'
});

// Every value dropped below has to say so, once per property key for the life of the
// process — which is why `box-shadow: none` is silent, boxShadow having warned already.
const dropped: string[] = [];
const warn = console.warn;
console.warn = (message) => dropped.push(String(message));

// `em` would need the inherited font size, and a `vh` in a compiled class rule could never follow a resize.
check('unsupported unit is dropped, not shipped', parse_css_text('font-size: 1em'), {});
check('so are viewport units', parse_css_text('height: 50vh; width: 10vw'), {});
check('multi-value box-shadow is dropped', parse_css_text('box-shadow: 0 2px 4px rgba(0,0,0,.2)'), {});
// GPUI types these as bare `f64`, so `auto` and `%` are just as fatal as `1em`.
check('auto never reaches a pixel-only key', parse_css_text('margin: 0 auto'), {
	marginTop: 0,
	marginBottom: 0
});
check('percent never reaches a pixel-only key', parse_css_text('border-radius: 50%; top: 50%'), {});
check('the slash of border-radius is dropped, and with it the two corners it fills', parse_css_text('border-radius: 10px / 20px'), {
	borderTopLeftRadius: 10,
	borderBottomRightRadius: 20
});
check('box-shadow keywords are dropped too', parse_css_text('box-shadow: none'), {});
check('percent still works where GPUI takes one', parse_css_text('max-width: 80%'), {
	maxWidth: '80%'
});

console.warn = warn;
const warned_keys = dropped.map((message) => /style value `([^:]+):/.exec(message)?.[1] ?? message);
check('every dropped value named its property', warned_keys, [
	'fontSize',
	'height',
	'width',
	'boxShadow',
	'marginRight',
	'marginLeft',
	'borderRadius',
	'top',
	'borderTopRightRadius',
	'borderBottomLeftRadius'
]);
check('and no property warned twice', warned_keys.length, new Set(warned_keys).size);

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

// commit() outlives a refused batch by resending it one op at a time, so only its log says whether native refused one.
const logged: string[] = [];
const log_error = console.error;
console.error = (message) => logged.push(String(message));
let threw: Error | null = null;
try {
	commit();
} catch (error) {
	threw = error as Error;
}
console.error = log_error;
check('commit survives a shorthand-heavy style, with nothing refused', [threw && threw.message, logged], [null, []]);

native.flush();
const box_bounds = native.getElementBounds(label.nativeId!);
check('padding actually applied (x, y)', box_bounds && [box_bounds.x, box_bounds.y].map(Math.round), [24, 12]);
check('and 1rem reached GPUI as 16 px', JSON.parse(native.getTreeJson()).children[0].style?.fontSize, 16);

// Copied from native's StyleDesc rather than exported by style.ts, so every entry is held against native as well.
const PIXEL_ONLY = [
	'flexGrow', 'flexShrink', 'flexBasis', 'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows',
	'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
	'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
	'top', 'right', 'bottom', 'left', 'opacity',
	'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
	'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
	'fontSize', 'lineHeight', 'lineClamp', 'aspectRatio', 'outlineWidth', 'outlineOffset', 'scrollbarWidth'
];
const TEXT_ONLY = [
	'display', 'visibility', 'flexDirection', 'flexWrap', 'alignItems', 'alignSelf', 'alignContent', 'justifyContent',
	'gridColumnMin', 'gridRowMin', 'position', 'background', 'backgroundColor', 'color', 'borderColor', 'borderStyle',
	'outlineColor', 'fontFamily', 'textAlign', 'whiteSpace', 'textOverflow', 'textDecoration',
	'overflow', 'overflowX', 'overflowY', 'scrollbarColor', 'cursor', 'pointerEvents', 'userSelect', 'selectionColor'
];
const DIMENSIONS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'];
const refused = (key: string, value: unknown) => {
	try {
		native.applyBatch(JSON.stringify([['setStyle', box.nativeId, { [key]: value }]]));
		return false;
	} catch (error) {
		return /parse error/.test((error as Error).message);
	}
};
console.warn = () => {};
check('no keyword reaches any pixel-only key, each of which native would refuse it on', PIXEL_ONLY.filter((key) => key in parse_css_text(`${key}: auto`) || !refused(key, 'auto')), []);
check('no number reaches any text key, each of which native would refuse it on', TEXT_ONLY.filter((key) => key in parse_css_text(`${key}: 123456`) || !refused(key, 123456)), []);
check(
	'every dimension key takes % and auto, reads intrinsic sizes as auto, and keeps out a length native would refuse',
	DIMENSIONS.filter((key) => {
		const read = (value: string) => parse_css_text(`${key}: ${value}`)[key];
		return read('50%') !== '50%' || read('auto') !== 'auto' || read('max-content') !== 'auto' || read('1em') !== undefined || !refused(key, '1em');
	}),
	[]
);
console.warn = warn;

// Class rules are parsed at compile time and a var() at runtime, so both paths have to reach the tree.
const FIXTURE = fileURLToPath(new URL('./StyleParity.svelte', import.meta.url));
check('a class rule converts rem when it is compiled', compile_svelte(FIXTURE).includes('"fontSize":16'), true);

const StyleParity = (await import('./StyleParity.svelte')).default;
// Set only now, past compile time: a real app's palette does not exist while its components compile.
set_css_vars({ 'parity-pad': '0.5rem 1rem' });
const parity = mount_headless(StyleParity);
const style_of = (id: string) => find_test_id(id)!.style ?? {};

check('overflow-y: auto lands as scroll', style_of('column').overflowY, 'scroll');
check('rem lands as pixels', [style_of('label').fontSize, style_of('label').paddingTop, style_of('label').paddingRight], [16, 8, 16]);
check('a var() resolves to pixels and a fallback auto to scroll', [style_of('themed').paddingLeft, style_of('themed').overflow], [16, 'scroll']);
// GPUI serializes `auto` as nothing, so the proof is that max-content overrode the 300px rule beneath it.
check('max-content and fit-content() override as auto', [style_of('sized').width ?? null, style_of('sized').minWidth ?? null], [null, null]);
check('so the box sizes to its text', parity.native.getElementBounds(find_test_id('sized')!.id)!.width < 300, true);

finish('style', 52);
