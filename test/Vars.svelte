<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';

	let { accent = 'var(--accent)' }: { accent?: string } = $props();
	let big = $state(false);

	// Substrate's shape: everything below is styled before this runs.
	$effect(() => set_css_vars({ late: '#0f0f0f' }));
</script>

<div class="card" class:big onclick={() => (big = !big)}>card</div>
<div class="fallback">fallback</div>
<div class="missing">missing</div>
<div class="late">late</div>
<div style="color: {accent}">inline</div>

<style>
	div { gap: 2px; }
	.card { background-color: var(--surface); padding: var(--pad); color: red; }
	.card:hover { background-color: var(--raised); }
	.card.big { padding: 20px; }
	.fallback { color: var(--nope, #123456); }
	.missing { color: var(--absent); border-width: 1px; }
	.late { color: var(--late); }
</style>
