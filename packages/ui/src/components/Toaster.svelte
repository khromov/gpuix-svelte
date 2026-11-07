<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Button from 'gpuix-svelte-ui/components/Button.svelte';
	import Icon from 'gpuix-svelte-ui/components/Icon.svelte';
	import { test_id } from 'gpuix-svelte-ui/shared';
	import { dismiss_toast, toasts, type ToastItem } from 'gpuix-svelte-ui/toast';

	// Rendered once, anywhere: it paints the queue `toast()` fills from a Portal, so it sits above the app.
	let {
		position = 'bottom-right',
		testid = null
	}: {
		position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
		/** The column's id; each toast gets `<testid>-<id>` and its dismiss button `<testid>-<id>-close`. */
		testid?: string | null;
	} = $props();

	function run(item: ToastItem) {
		item.action?.onclick();
		dismiss_toast(item.id);
	}
</script>

{#if toasts.current.length > 0}
	<!-- Portals paint in mount order, so the layer is remounted for each new toast and lands above a Dialog opened since. -->
	{#key toasts.current[toasts.current.length - 1].id}
		<Portal>
			<div class="toaster {position}" {...test_id(testid)}>
			{#each toasts.current as item (item.id)}
				<div class="toast {item.tone}" role="status" {...test_id(testid ? `${testid}-${item.id}` : null)}>
					<div class="bar {item.tone}"></div>
					<div class="text">
						<div class="title">{item.title}</div>
						{#if item.description}<div class="description">{item.description}</div>{/if}
					</div>
					{#if item.action}
						<Button size="sm" variant="ghost" onclick={() => run(item)}>{item.action.label}</Button>
					{/if}
					<Button size="sm" variant="ghost" label="Dismiss" onclick={() => dismiss_toast(item.id)} testid={testid ? `${testid}-${item.id}-close` : null}>
						<Icon name="close" size={14} />
					</Button>
				</div>
			{/each}
			</div>
		</Portal>
	{/key}
{/if}

<style>
	.toaster {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		pointer-events: none;
	}
	.toaster.top-left {
		top: 0;
		left: 0;
	}
	.toaster.top-center {
		top: 0;
		left: 0;
		right: 0;
		align-items: center;
	}
	.toaster.top-right {
		top: 0;
		right: 0;
		align-items: end;
	}
	.toaster.bottom-left {
		bottom: 0;
		left: 0;
	}
	.toaster.bottom-center {
		bottom: 0;
		left: 0;
		right: 0;
		align-items: center;
	}
	.toaster.bottom-right {
		bottom: 0;
		right: 0;
		align-items: end;
	}
	.toast {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		min-width: 260px;
		max-width: 420px;
		padding: 10px 10px 10px 0;
		border-radius: 10px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		overflow: hidden;
		pointer-events: auto;
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-ink);
	}
	.bar {
		width: 4px;
		align-self: stretch;
		flex-shrink: 0;
		background-color: var(--ui-border-strong);
	}
	.bar.accent {
		background-color: var(--ui-accent);
	}
	.bar.success {
		background-color: var(--ui-success);
	}
	.bar.warning {
		background-color: var(--ui-warning);
	}
	.bar.danger {
		background-color: var(--ui-danger);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-grow: 1;
		min-width: 0;
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
	}
	.description {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
</style>
