<script>
	import { close_modal, ui } from '../lib/ui.svelte.js';
	import Button from './Button.svelte';

	const modal = $derived(ui.modal);
</script>

{#if modal}
	<div class="scrim" onclick={() => close_modal(false)}>
		<div class="dialog" onclick={() => {}}>
			<div class="title">{modal.title}</div>
			{#if modal.body}<div class="body">{modal.body}</div>{/if}
			<div class="actions">
				<Button label={modal.cancelLabel ?? 'Cancel'} onclick={() => close_modal(false)} />
				<Button label={modal.confirmLabel ?? 'OK'} variant={modal.danger ? 'danger' : 'primary'} onclick={() => close_modal(true)} testid="modal-confirm" />
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; background-color: var(--scrim); }
	.dialog { display: flex; flex-direction: column; gap: 12px; width: 420px; padding: 20px; border-radius: 12px; border-width: 1px; background-color: var(--control); border-color: var(--borderStrong); color: var(--ink); }
	.title { font-size: 16px; line-height: 22px; font-weight: 600; }
	.body { font-size: 13px; line-height: 20px; color: var(--inkMuted); }
	.actions { display: flex; flex-direction: row; justify-content: end; gap: 8px; padding-top: 4px; }
</style>
