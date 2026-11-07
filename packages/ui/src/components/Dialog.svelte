<script lang="ts">
	import type { Snippet } from 'svelte';
	import { on_window_key } from 'gpuix-svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Button from 'gpuix-svelte-ui/components/Button.svelte';
	import Icon from 'gpuix-svelte-ui/components/Icon.svelte';
	import { open_overlay, test_id } from 'gpuix-svelte-ui/shared';

	let {
		open,
		onclose,
		title = null,
		description = null,
		children,
		actions = null,
		size = 'md',
		dismissable = true,
		testid = null
	}: {
		open: boolean;
		/** Escape, the close button, or a click on the scrim, unless `dismissable` is false. */
		onclose: () => void;
		title?: string | null;
		description?: string | null;
		children: Snippet;
		/** Buttons along the bottom. */
		actions?: Snippet | null;
		size?: 'sm' | 'md' | 'lg';
		/** False keeps it open until the app closes it: no close button, Escape and the scrim do nothing. */
		dismissable?: boolean;
		/** The dialog's id; the scrim gets `<testid>-scrim` and the close button `<testid>-close`. */
		testid?: string | null;
	} = $props();

	function dismiss() {
		if (dismissable) onclose();
	}

	// Only the topmost overlay answers Escape, so a Select or Menu open inside closes alone first.
	$effect(() => {
		if (!open) return;
		const overlay = open_overlay();
		const off = on_window_key('keydown', (e) => {
			if (e.key === 'escape' && overlay.on_top()) dismiss();
		});
		return () => {
			off();
			overlay.release();
		};
	});

	// In a page, a drag that starts in the panel and ends over the scrim clicks the scrim; only a press that
	// began there counts. GPUI reports a click only where the press landed, so both reads say the same.
	type Targeted = { target?: unknown; currentTarget?: unknown };
	let pressed_scrim = false;
	const on_scrim = (e: Targeted) => e.target === e.currentTarget;
	function scrim_click(e: Targeted) {
		if (pressed_scrim && on_scrim(e)) dismiss();
		pressed_scrim = false;
	}
</script>

{#if open}
	<Portal>
		<div class="scrim" onmousedown={(e) => (pressed_scrim = on_scrim(e))} onclick={scrim_click} {...test_id(testid ? `${testid}-scrim` : null)}>
			<div class="dialog {size}" role="dialog" aria-label={title} onclick={(e) => e.stopPropagation()} {...test_id(testid)}>
				{#if title || dismissable}
					<div class="head">
						<div class="heading">
							{#if title}<div class="title">{title}</div>{/if}
							{#if description}<div class="description">{description}</div>{/if}
						</div>
						{#if dismissable}
							<Button variant="ghost" size="sm" label="Close" onclick={onclose} testid={testid ? `${testid}-close` : null}>
								<Icon name="close" size={14} />
							</Button>
						{/if}
					</div>
				{:else if description}
					<div class="description">{description}</div>
				{/if}
				<div class="body">{@render children()}</div>
				{#if actions}<div class="actions">{@render actions()}</div>{/if}
			</div>
		</div>
	</Portal>
{/if}

<style>
	.scrim {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 24px;
		box-sizing: border-box;
		background-color: #00000099;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		max-width: 440px;
		padding: 20px;
		border-radius: 12px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-ink);
	}
	.dialog.sm {
		max-width: 340px;
	}
	.dialog.lg {
		max-width: 640px;
	}
	.head {
		display: flex;
		flex-direction: row;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}
	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.title {
		font-size: 16px;
		font-weight: 600;
		line-height: 22px;
	}
	.description {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 14px;
	}
	.actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: end;
		gap: 8px;
	}
</style>
