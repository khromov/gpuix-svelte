<script>
	import Portal from 'gpuix-svelte/components/Portal.svelte';

	let show = $state(true);
	let second = $state(false);
	let hits = $state({ under: 0, over: 0, second: 0 });
</script>

<div class="page">
	<div class="stack">
		{#if show}
			<div class="inner" testId="inner">
				<Portal>
					<div class="over" onclick={() => hits.over++} testId="over">over</div>
				</Portal>
				<div class="tail" testId="tail">tail</div>
			</div>
		{/if}
		<div class="under" onclick={() => hits.under++} testId="under">under</div>
	</div>
	{#if second}
		<Portal>
			<div class="second" onclick={() => hits.second++} testId="second">second</div>
		</Portal>
	{/if}
	<div class="row">
		<div onclick={() => (show = !show)} testId="toggle">toggle</div>
		<div onclick={() => (second = !second)} testId="add">add</div>
		<div testId="hits">{hits.under}-{hits.over}-{hits.second}</div>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 8px; padding: 8px; width: 100%; height: 100%; }
	.stack { position: relative; height: 140px; }
	.under { position: absolute; top: 10px; left: 10px; width: 200px; height: 100px; background-color: #ff0000; }
	.over { position: absolute; top: 20px; left: 20px; width: 120px; height: 60px; background-color: #00ff00; }
	.second { position: absolute; top: 40px; left: 40px; width: 120px; height: 60px; background-color: #0000ff; }
	.row { display: flex; flex-direction: row; gap: 12px; }
</style>
