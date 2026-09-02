<script>
	import { resolved } from '../lib/theme.svelte.js';
	import { ui } from '../lib/ui.svelte.js';

	const mode = $derived(resolved());
</script>

<div class="toasts">
	{#each ui.toasts as toast (toast.id)}
		<div class="toast {toast.kind} {mode}">{toast.text}</div>
	{/each}
</div>

<style>
	.toasts { position: absolute; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; align-items: end; pointer-events: none; }
	.toast { max-width: 420px; padding: 10px 14px; border-radius: 8px; border-width: 1px; font-size: 13px; line-height: 18px; pointer-events: none; }
	.toast.info.light { background-color: #2a251f; border-color: #2a251f; color: #f5efe4; }
	.toast.info.dark { background-color: #ece3d3; border-color: #ece3d3; color: #1b1815; }
	.toast.success.light { background-color: #5f7a4a; border-color: #5f7a4a; color: #f8f5ec; }
	.toast.success.dark { background-color: #8fae74; border-color: #8fae74; color: #1b1815; }
	.toast.error.light { background-color: #a9483a; border-color: #a9483a; color: #fbf7ef; }
	.toast.error.dark { background-color: #d46f5e; border-color: #d46f5e; color: #1b1815; }
</style>
