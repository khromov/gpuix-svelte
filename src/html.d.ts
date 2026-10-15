/**
 * Markup types for GPUI's elements. The Svelte language server and svelte-check type every tag
 * as a DOM element unless tsconfig's `"svelteOptions": { "namespace": "gpuixHTML" }` points them
 * here — then `hover=`, `onfiledrop` and `<virtual-list>` check, and `<span>` does not.
 *
 * svelte2tsx lowercases every attribute name except `on*` before checking it, unless the tag has a
 * hyphen, so `minRows` is also declared as `minrows` (the `{minRows}` shorthand keeps its case),
 * while Svelte ships `minRows` at runtime.
 */

import type { Snippet } from 'svelte';
import type { ClassValue } from 'svelte/elements';
import type { GpuixTheme, HighlightSpec, MotionProps } from '@gpuix/native/host';
import type { GpuixEvent, ShadowNode } from './types.ts';

type Handler = ((this: ShadowNode, event: GpuixEvent) => void) | null | undefined;
type Flag = boolean | 'true' | 'false' | '' | null | undefined;
type Count = number | `${number}` | null | undefined;
type Text = string | null | undefined;
/** `change`/`submit` carry the field's text, `linkClick` the URL, `lineClick` the line, and so on. */
type TextHandler = ((this: ShadowNode, event: GpuixEvent & { value: string }) => void) | null | undefined;

interface GpuixEvents {
	onclick?: Handler;
	onauxclick?: Handler;
	onmousedown?: Handler;
	onmouseup?: Handler;
	onmouseenter?: Handler;
	onmouseleave?: Handler;
	onmousemove?: Handler;
	onmousedownoutside?: Handler;
	onkeydown?: Handler;
	onkeyup?: Handler;
	onfocus?: Handler;
	onblur?: Handler;
	onscroll?: Handler;
	onfiledrop?: Handler;
	onmotioncomplete?: Handler;
	onhighlight?: Handler;
}

interface GpuixAttributes extends GpuixEvents {
	children?: Snippet;
	/** CSS text; docs/styling.md says what GPUI makes of it. */
	style?: Text;
	class?: ClassValue | null | undefined;
	/** CSS text applied while the pointer is over the element; wins over a `:hover` rule. */
	hover?: Text;
	active?: Text;
	/** Shield every descendant without a listener of its own from hit testing. */
	hitbox?: 'self' | null | undefined;
	/** Paint natively from the root, on top of everything mounted before it. */
	portal?: Flag;
	testid?: Text;
	tabindex?: Count;
	autofocus?: Flag;
	motion?: MotionProps | null | undefined;
	highlight?: HighlightSpec | HighlightSpec[] | null | undefined;
	role?: Text;
	'aria-label'?: Text;
	'aria-description'?: Text;
	'aria-id'?: Text;
	'aria-expanded'?: Flag;
	'aria-selected'?: Flag;
	'aria-valuetext'?: Text;
	'aria-level'?: Count;
	// Svelte drops a return that is not a function, so `(node) => (x = node)` is fine.
	[key: symbol]: ((node: ShadowNode) => unknown) | false | null | undefined;
}

interface InputAttributes extends GpuixAttributes {
	value?: Text;
	placeholder?: Text;
	readonly?: Flag;
	/** The `{readOnly}` shorthand keeps its case. */
	readOnly?: Flag;
	theme?: GpuixTheme;
	onchange?: TextHandler;
	/** Enter in an `<input>`; Enter in a `<textarea>` only when this is set. */
	onsubmit?: TextHandler;
}

interface TextareaAttributes extends InputAttributes {
	minrows?: Count;
	maxrows?: Count;
	minRows?: Count;
	maxRows?: Count;
}

interface ImgAttributes extends GpuixAttributes {
	/** A filesystem path, a `data:` URL or an http(s) URL. */
	src?: Text;
	objectfit?: 'fill' | 'contain' | 'cover' | 'scaleDown' | 'none' | null | undefined;
	alt?: Text;
}

interface SvgAttributes extends GpuixAttributes {
	/** Raw SVG markup. */
	source?: Text;
	src?: Text;
}

interface CodeAttributes extends GpuixAttributes {
	code?: Text;
	language?: Text;
	path?: Text;
	showlinenumbers?: Flag;
	theme?: GpuixTheme;
	onlineclick?: TextHandler;
}

interface DiffAttributes extends GpuixAttributes {
	patch?: Text;
	worddiff?: Flag;
	collapsedpaths?: string[];
	scroll?: Flag;
	maxlines?: Count;
	theme?: GpuixTheme;
	ontogglefile?: TextHandler;
	onshowmore?: TextHandler;
	onlineclick?: TextHandler;
}

interface MarkdownAttributes extends GpuixAttributes {
	source?: Text;
	theme?: GpuixTheme;
	onlinkclick?: TextHandler;
}

/** A hyphenated tag, so its attributes are checked as written. */
interface VirtualListAttributes extends GpuixAttributes {
	testId?: Text;
	alignment?: 'top' | 'bottom' | null | undefined;
	followTail?: Flag;
	overdraw?: Count;
	estimatedItemHeight?: Count;
	itemCount?: Count;
	windowStart?: Count;
	onvisiblerange?: Handler;
}

type Corner = 'topLeft' | 'topCenter' | 'topRight' | 'rightCenter' | 'bottomRight' | 'bottomCenter' | 'bottomLeft' | 'leftCenter';

interface AnchoredAttributes extends GpuixAttributes {
	position?: { x: number; y: number } | null | undefined;
	side?: 'top' | 'right' | 'bottom' | 'left';
	align?: 'start' | 'center' | 'end';
	gap?: Count;
	anchor?: Corner;
	offset?: { x: number; y: number } | null | undefined;
	fit?: 'switch' | 'snap';
	snapmargin?: Count;
	deferred?: Flag;
	priority?: Count;
	occlude?: Flag;
}

/** `<svelte:window>` and friends have nothing to bind to here; Svelte's own tags take their own attributes. */
interface SvelteTags {
	'svelte:element': GpuixAttributes & { this?: string | null };
	'svelte:boundary': { onerror?: (error: unknown, reset: () => void) => void; failed?: Snippet<[unknown, () => void]>; pending?: Snippet; children?: Snippet };
	'svelte:options': Record<string, unknown>;
	'svelte:head': { children?: Snippet };
	'svelte:window': Record<string, unknown>;
	'svelte:document': Record<string, unknown>;
	'svelte:body': Record<string, unknown>;
}

declare global {
	namespace gpuixHTML {
		function mapElementTag(tag: string): ShadowNode;

		function createElement<Elements extends IntrinsicElements, Key extends keyof Elements>(
			element: Key | undefined | null,
			attrs: string extends Key ? GpuixAttributes : Elements[Key]
		): ShadowNode;
		function createElement<Elements extends IntrinsicElements, Key extends keyof Elements, T>(
			element: Key | undefined | null,
			attrsEnhancers: T,
			attrs: (string extends Key ? GpuixAttributes : Elements[Key]) & T
		): ShadowNode;

		interface IntrinsicElements extends SvelteTags {
			div: GpuixAttributes;
			text: GpuixAttributes;
			canvas: GpuixAttributes;
			img: ImgAttributes;
			svg: SvgAttributes;
			input: InputAttributes;
			textarea: TextareaAttributes;
			code: CodeAttributes;
			diff: DiffAttributes;
			markdown: MarkdownAttributes;
			'virtual-list': VirtualListAttributes;
			anchored: AnchoredAttributes;
		}
	}
}
