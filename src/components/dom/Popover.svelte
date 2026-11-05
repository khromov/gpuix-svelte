<script lang="ts">
	import type { Snippet } from 'svelte';
	import { on_window_key } from 'gpuix-svelte';
	import Anchored from './Anchored.svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';

	let {
		open,
		onclose,
		children,
		content,
		side = 'bottom',
		align = 'start',
		gap = 4,
		position = null,
		style = null,
		testid = null
	}: {
		open: boolean;
		/** A press outside the panel and the trigger, or Escape. */
		onclose: () => void;
		/** The trigger; it toggles `open` itself. */
		children: Snippet;
		content: Snippet;
		side?: Side;
		align?: Align;
		gap?: number;
		/** Viewport coordinates to hang from instead of the trigger, e.g. a context menu's `clientX`/`clientY`. */
		position?: { x: number; y: number } | null;
		/** Inline CSS for the panel, which wins over its own rules: `padding: 0; border-radius: 12px`. */
		style?: string | null;
		testid?: string | null;
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let panel: HTMLElement | null = null;

	// The trigger's own click closes it, and closing here first would let that click reopen it.
	function outside(e: MouseEvent) {
		const target = e.target as Node | null;
		if (!target || panel?.contains(target) || anchor?.contains(target)) return;
		onclose();
	}

	$effect(() => {
		if (!open) return;
		document.addEventListener('mousedown', outside, true);
		const off = on_window_key('keydown', (e) => {
			if (e.key === 'escape') onclose();
		});
		return () => {
			document.removeEventListener('mousedown', outside, true);
			off();
		};
	});
</script>

<div class="host">
	<div class="anchor" data-testid={testid} {@attach (node: HTMLElement) => (anchor = node)}>
		{@render children()}
		{#if open}
			<Anchored {anchor} {side} {align} {gap} {position}>
				<div class="panel" {style} data-testid={testid && `${testid}-panel`} {@attach (node: HTMLElement) => (panel = node)}>
					{@render content()}
				</div>
			</Anchored>
		{/if}
	</div>
</div>

<style>
	.host { display: flex; align-items: start; }
	.anchor { position: relative; display: flex; }
	.panel {
		display: flex;
		flex-direction: column;
		padding: 4px;
		border-radius: 8px;
		border: 1px solid var(--popover-border, #45475a);
		background-color: var(--popover-surface, #1e1e2e);
		color: var(--popover-ink, #cdd6f4);
	}
</style>
