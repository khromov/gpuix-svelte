<script lang="ts">
	import { IS_GPUIX, type GpuixTheme } from 'gpuix-svelte';
	import { key_of } from 'gpuix-svelte-ui/keys';
	import { test_id } from 'gpuix-svelte-ui/shared';
	import { theme } from 'gpuix-svelte-ui/theme';

	let {
		value,
		onchange,
		onsubmit = null,
		placeholder = '',
		label = null,
		hint = null,
		error = null,
		disabled = false,
		readonly = false,
		autofocus = false,
		testid = null
	}: {
		value: string;
		/** Every edit, with the field's new text. */
		onchange: (value: string) => void;
		/** Enter. */
		onsubmit?: ((value: string) => void) | null;
		placeholder?: string;
		label?: string | null;
		hint?: string | null;
		/** Shown in place of the hint, and colours the field. */
		error?: string | null;
		disabled?: boolean;
		readonly?: boolean;
		autofocus?: boolean;
		/** The wrapper's id; the `<input>` itself gets `<testid>-input`. */
		testid?: string | null;
	} = $props();

	type Change = { value?: unknown; target?: unknown };

	// GPUI's `change` carries the text as `e.value`; the DOM's `input` carries the element it came from.
	const text_of = (e: Change) => (typeof e.value === 'string' ? e.value : String((e.target as { value?: string } | null)?.value ?? ''));

	// A browser's `:focus-visible` matches a clicked text field and GPUI's only a tabbed one, so the border follows this instead.
	let focused = $state(false);
	const watch = { onfocus: () => (focused = true), onblur: () => (focused = false) };

	// GPUI's input draws itself from a theme object rather than CSS, so the palette in force goes along with the handlers.
	const field = $derived.by(() => {
		if (IS_GPUIX) {
			const p = theme.palette;
			const skin: GpuixTheme = { appearance: p.appearance, bg: 'transparent', border: 'transparent', text: p.ink, textMuted: p.muted, accent: p.accent, caret: p.accent };
			// Native has read-only but no disabled state, so the tab stop and Enter are taken away by hand.
			const live = disabled ? { tabindex: -1 } : { ...(autofocus ? { autofocus: true } : {}), onsubmit: (e: Change) => onsubmit?.(text_of(e)) };
			return { ...watch, ...live, theme: skin, readOnly: disabled || readonly, onchange: (e: Change) => onchange(text_of(e)) };
		}
		return {
			...watch,
			...(autofocus ? { autofocus: true } : {}),
			disabled,
			readonly,
			'aria-invalid': error !== null,
			oninput: (e: Change) => onchange(text_of(e)),
			// Enter during an IME composition commits the composition, not the field.
			onkeydown: (e: Change & { key?: string; isComposing?: boolean }) => {
				if (key_of(e) === 'enter' && !e.isComposing) onsubmit?.(text_of(e));
			}
		};
	});
</script>

<div class="field" class:disabled class:invalid={error !== null} {...test_id(testid)}>
	{#if label}<div class="label">{label}</div>{/if}
	<input class="input" class:invalid={error !== null} class:focused={focused && !disabled} aria-label={label} {value} {placeholder} {...field} {...test_id(testid ? `${testid}-input` : null)} />
	{#if error}
		<div class="error">{error}</div>
	{:else if hint}
		<div class="hint">{hint}</div>
	{/if}
	<!-- GPUI's input takes a click whatever its pointer-events say, so a disabled one is covered: by a painted box, which blocks the click and not the wheel as an explicit pointer-events would. -->
	{#if disabled}<div class="shield"></div>{/if}
</div>

<style>
	.field {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.shield {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		background-color: #00000001;
	}
	.field.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.label {
		font-size: 13px;
		font-weight: 500;
		line-height: 18px;
		color: var(--ui-ink);
	}
	.input {
		display: flex;
		align-items: center;
		width: 100%;
		height: 34px;
		padding: 0 10px;
		border-radius: 8px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		outline-width: 0;
		font-size: 14px;
		line-height: 20px;
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-ink);
	}
	.input:hover {
		border-color: var(--ui-muted);
	}
	.input.focused {
		border-color: var(--ui-accent);
	}
	.input.focused:hover {
		border-color: var(--ui-accent);
	}
	.input.invalid {
		border-color: var(--ui-danger);
	}
	.input.invalid:hover {
		border-color: var(--ui-danger);
	}
	.hint,
	.error {
		font-size: 12px;
		line-height: 16px;
		color: var(--ui-muted);
	}
	.error {
		color: var(--ui-danger);
	}
</style>
