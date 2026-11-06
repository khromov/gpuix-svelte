<script lang="ts">
	import type { Snippet } from 'svelte';
	import { on_window_key } from 'gpuix-svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Button from 'gpuix-svelte-ui/components/Button.svelte';
	import Icon from 'gpuix-svelte-ui/components/Icon.svelte';
	import { test_id } from 'gpuix-svelte-ui/shared';

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

	$effect(() => {
		if (!open) return;
		return on_window_key('keydown', (e) => {
			if (e.key === 'escape') dismiss();
		});
	});
</script>

{#if open}
	<Portal>
		<div class="scrim" onclick={dismiss} {...test_id(testid ? `${testid}-scrim` : null)}>
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
