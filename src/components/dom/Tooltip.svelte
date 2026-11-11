<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { dismiss_layer } from 'gpuix-svelte';
	import Anchored from './Anchored.svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';
	type Hover = { onmouseenter: () => void; onmouseleave: () => void };
	type Focus = { onfocus: () => void; onblur: () => void };

	let {
		children,
		content,
		side = 'top',
		align = 'center',
		gap = 6,
		delay = 300,
		open = null,
		style = null,
		testid = null
	}: {
		/** The trigger; the hover handlers it is passed exist for the GPUI version, where a listener of its own would occlude the wrapper, and the focus ones show the tip on keyboard focus. */
		children: Snippet<[Hover, Focus]>;
		content: string | Snippet;
		side?: Side;
		align?: Align;
		gap?: number;
		/** ms of hover before the tip shows. */
		delay?: number;
		/** Forces the tip shown or hidden; `null` leaves it to hover and focus. */
		open?: boolean | null;
		/** Inline CSS for the tip box, which wins over its own rules: `padding: 0; border-radius: 12px`. */
		style?: string | null;
		testid?: string | null;
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let shown = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// The wrapper and the trigger's spread handlers report separately, so hover is tracked per source
	// rather than by the last event, and the 80 ms grace once neither is hovered covers the handoff.
	const over = { wrap: false, trigger: false, focus: false };

	function sync() {
		clearTimeout(timer);
		if (!over.wrap && !over.trigger && !over.focus) timer = setTimeout(() => (shown = false), 80);
		else if (!shown) timer = setTimeout(() => (shown = true), delay);
	}

	function hide() {
		clearTimeout(timer);
		over.focus = false;
		shown = false;
	}

	const track = (source: Exclude<keyof typeof over, 'focus'>): Hover => ({
		onmouseenter: () => {
			over[source] = true;
			over.focus = false;
			sync();
		},
		onmouseleave: () => {
			over[source] = false;
			sync();
		}
	});

	const wrap = track('wrap');
	const trigger = track('trigger');
	const focus: Focus = {
		// Focus that arrives with the pointer already on the trigger came from a click, which hover covers.
		onfocus: () => {
			if (over.wrap || over.trigger) return;
			over.focus = true;
			clearTimeout(timer);
			shown = true;
		},
		// A blur that ends no focus-shown tip must not reach sync(), which would reopen one Escape dismissed under a resting pointer.
		onblur: () => {
			if (!over.focus) return;
			over.focus = false;
			sync();
		}
	};

	// A tip that `open` forces can't be dismissed, so it must not take an Escape meant for a layer below.
	$effect(() => {
		if (open != null || !shown) return;
		return dismiss_layer({ onEscape: hide });
	});

	onDestroy(() => clearTimeout(timer));
</script>

<div class="host">
	<div class="anchor" {...wrap} data-testid={testid} {@attach (node: HTMLElement) => (anchor = node)}>
		{@render children(trigger, focus)}
		{#if open ?? shown}
			<!-- No pointer, as on GPUI: a tip snapped over its own trigger must not take the trigger's clicks. -->
			<Anchored {anchor} {side} {align} {gap} occlude={false}>
				<div class="tip" role="tooltip" {style} data-testid={testid && `${testid}-tip`}>
					{#if typeof content === 'string'}{content}{:else}{@render content()}{/if}
				</div>
			</Anchored>
		{/if}
	</div>
</div>

<style>
	.host { display: flex; align-items: start; }
	.anchor { position: relative; display: flex; }
	.tip {
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		line-height: 16px;
		white-space: nowrap;
		user-select: none;
		background-color: var(--tooltip-surface, #1c1c1c);
		color: var(--tooltip-ink, #ededed);
	}
</style>
