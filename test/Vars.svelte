<script>
	let { accent = 'var(--accent)' } = $props();
	let big = $state(false);
</script>

<div class="card" class:big onclick={() => (big = !big)}>card</div>
<div class="fallback">fallback</div>
<div class="missing">missing</div>
<div style="color: {accent}">inline</div>

<style>
	div { gap: 2px; }
	.card { background-color: var(--surface); padding: var(--pad); color: red; }
	.card:hover { background-color: var(--raised); }
	.card.big { padding: 20px; }
	.fallback { color: var(--nope, #123456); }
	.missing { color: var(--absent); border-width: 1px; }
</style>
