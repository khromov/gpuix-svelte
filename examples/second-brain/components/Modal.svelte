<script>
	import { resolved } from '../lib/theme.svelte.js';
	import { close_modal, ui } from '../lib/ui.svelte.js';
	import Button from './Button.svelte';

	const mode = $derived(resolved());
	const modal = $derived(ui.modal);
</script>

{#if modal}
	<div class="scrim {mode}" onclick={() => close_modal(false)}>
		<div class="dialog {mode}" onclick={() => {}}>
			<div class="title">{modal.title}</div>
			{#if modal.body}<div class="body {mode}">{modal.body}</div>{/if}
			<div class="actions">
				<Button label={modal.cancelLabel ?? 'Cancel'} onclick={() => close_modal(false)} />
				<Button label={modal.confirmLabel ?? 'OK'} variant={modal.danger ? 'danger' : 'primary'} onclick={() => close_modal(true)} testid="modal-confirm" />
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; }
	.scrim.light { background-color: rgba(42, 37, 31, 0.42); }
	.scrim.dark { background-color: rgba(0, 0, 0, 0.55); }
	.dialog { display: flex; flex-direction: column; gap: 12px; width: 420px; padding: 20px; border-radius: 12px; border-width: 1px; }
	.dialog.light { background-color: #fbf7ef; border-color: #cbbfa6; color: #2a251f; }
	.dialog.dark { background-color: #2b2621; border-color: #4a4237; color: #ece3d3; }
	.title { font-size: 16px; line-height: 22px; font-weight: 600; }
	.body { font-size: 13px; line-height: 20px; }
	.body.light { color: #6b6154; }
	.body.dark { color: #b2a791; }
	.actions { display: flex; flex-direction: row; justify-content: end; gap: 8px; padding-top: 4px; }
</style>
