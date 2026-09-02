<script lang="ts">
	import { ui } from '../lib/ui.svelte.ts';

</script>

<div class="toasts">
	{#each ui.toasts as toast (toast.id)}
		<div class="toast {toast.kind}">{toast.text}</div>
	{/each}
</div>

<style>
	.toasts { position: absolute; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; align-items: end; pointer-events: none; }
	.toast { max-width: 420px; padding: 10px 14px; border-radius: 8px; border-width: 1px; font-size: 13px; line-height: 18px; pointer-events: none; }
	.toast.info { background-color: var(--ink); border-color: var(--ink); color: var(--bg); }
	.toast.success { background-color: var(--accent); border-color: var(--accent); color: var(--accentInk); }
	.toast.error { background-color: var(--danger); border-color: var(--danger); color: var(--dangerInk); }
</style>
