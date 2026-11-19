<script lang="ts">
	import { focused_element } from 'gpuix-svelte';

	let first = $state('');
	let second = $state('');
	let query = $state('');
	let tick = $state(0);
	let async_result = $state('Waiting for promise…');
	let focused = $state('none');
	let rows = $state(Array.from({ length: 24 }, (_, id) => ({ id, label: `Row ${id + 1}` })));

	$effect(() => {
		const timer = setInterval(() => tick++, 1000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const value = query;
		Promise.resolve(`Loaded “${value || 'everything'}”`).then((result) => (async_result = result));
	});

	function add_row() {
		const id = Math.max(-1, ...rows.map((row) => row.id)) + 1;
		rows = [...rows, { id, label: `Row ${id + 1}` }];
	}
</script>

<div class="page">
	<text class="title">QuickJS integration</text>
	<text class="status">Timer {tick}s · {async_result}</text>
	<div class="fields">
		<input value={first} onchange={(e) => (first = e.value)} placeholder="First input" aria-label="First input" onfocus={() => (focused = focused_element()?.name ?? 'none')} />
		<input value={second} onchange={(e) => (second = e.value)} placeholder="Second input" aria-label="Second input" onfocus={() => (focused = focused_element()?.name ?? 'none')} />
	</div>
	<div class="actions">
		<button class="button" onclick={() => (query = first)}>Search first</button>
		<button class="button" onclick={() => (query = second)}>Search second</button>
		<button class="button" onclick={add_row}>Add keyed row</button>
	</div>
	<text class="focus">Focused native element: {focused}</text>
	<div class="scroller">
		{#each rows as row (row.id)}
			<div class="row"><text>{row.label}</text><text>{row.id}</text></div>
		{/each}
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 12px; padding: 20px; width: 100%; height: 100%; color: #ededed; background-color: #101014; }
	.title { font-size: 24px; }
	.status, .focus { color: #aaaaaa; }
	.fields, .actions { display: flex; gap: 8px; }
	.fields { flex-direction: column; }
	input { padding: 8px; border-radius: 6px; border-width: 1px; border-color: #404048; background-color: #1b1b22; color: #ededed; }
	.button { padding: 8px 10px; border-radius: 6px; background-color: #272733; }
	.scroller { display: flex; flex-direction: column; gap: 4px; height: 100%; overflow-y: scroll; }
	.row { display: flex; justify-content: space-between; padding: 8px; border-radius: 4px; background-color: #1b1b22; }
</style>
