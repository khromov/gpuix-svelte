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

	// GPUI's input draws itself from a theme object rather than CSS, so the palette in force goes along with the handlers.
	const field = $derived.by(() => {
		const focus = autofocus ? { autofocus: true } : {};
		if (IS_GPUIX) {
			const p = theme.palette;
			const skin: GpuixTheme = { appearance: p.appearance, bg: 'transparent', border: 'transparent', text: p.ink, textMuted: p.muted, accent: p.accent, caret: p.accent };
			return {
				...focus,
				theme: skin,
				readOnly: disabled || readonly,
				onchange: (e: Change) => onchange(text_of(e)),
				onsubmit: (e: Change) => onsubmit?.(text_of(e))
			};
		}
		return {
			...focus,
			disabled,
			readonly,
			oninput: (e: Change) => onchange(text_of(e)),
			onkeydown: (e: Change & { key?: string }) => {
				if (key_of(e) === 'enter') onsubmit?.(text_of(e));
			}
		};
	});
</script>

<div class="field" class:disabled class:invalid={error !== null} {...test_id(testid)}>
	{#if label}<div class="label">{label}</div>{/if}
	<input class="input" class:invalid={error !== null} {value} {placeholder} {...field} {...test_id(testid ? `${testid}-input` : null)} />
	{#if error}
		<div class="error">{error}</div>
	{:else if hint}
		<div class="hint">{hint}</div>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
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
	.input:focus-visible {
		border-color: var(--ui-accent);
	}
	.input.invalid {
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
