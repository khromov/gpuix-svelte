<script lang="ts">
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';

	let counts = $state({ save: 0, under: 0, closes: 0, item: 0, elsewhere: 0 });
	let menu = $state(false);
</script>

<div class="page">
	<div class="row">
		<div class="raw" testId="raw-start">
			start
			<anchored side="top" align="start" gap={6} class="clear"><div class="chip">raw start</div></anchored>
		</div>
		<div class="raw" testId="raw-center">
			center
			<anchored side="top" align="center" gap={6} class="clear"><div class="chip">raw center</div></anchored>
		</div>
	</div>

	<div class="row">
		<Tooltip content="Decorative" delay={50} testid="deco">
			<div class="badge">badge</div>
		</Tooltip>
		<Tooltip content="Save (cmd-s)" side="bottom" delay={50} testid="save">
			{#snippet children(hover)}
				<div class="btn" {...hover} onclick={() => counts.save++} testId="save-trigger">Save</div>
			{/snippet}
		</Tooltip>
	</div>
	<div class="under" onclick={() => counts.under++} testId="under">under</div>

	<div class="row">
		<Popover open={menu} onclose={() => ((menu = false), counts.closes++)} style="background-color: #dc8a78; border-radius: 0" testid="menu">
			<div class="btn" onclick={() => (menu = !menu)} testId="menu-trigger">Menu</div>
			{#snippet content()}
				<div class="item" onclick={() => counts.item++} testId="menu-item">Item</div>
			{/snippet}
		</Popover>
		<div class="btn" onclick={() => counts.elsewhere++} testId="elsewhere">Elsewhere</div>
	</div>

	<div testId="counts">{counts.save}-{counts.under}-{counts.closes}-{counts.item}-{counts.elsewhere}</div>

	<Tooltip open side="right" style="background-color: #1e66f5; border-radius: 0" testid="pinned">
		<div class="badge">pinned</div>
		{#snippet content()}
			<div class="rich">Rich</div>
		{/snippet}
	</Tooltip>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 8px; padding: 48px 120px; width: 100%; height: 100%; background-color: #eff1f5; color: #4c4f69; }
	.row { display: flex; flex-direction: row; gap: 100px; align-items: center; }
	.raw { position: relative; display: flex; width: 120px; height: 24px; background-color: #ccd0da; }
	.clear { background-color: #00000001; }
	.chip { padding: 2px 6px; border-radius: 6px; background-color: #f9e2af; }
	.badge { padding: 4px 8px; border-radius: 10px; background-color: #ccd0da; }
	.btn { padding: 4px 12px; background-color: #bcc0cc; }
	.under { height: 40px; background-color: #dce0e8; }
	.item { padding: 4px 8px; }
	.rich { font-weight: bold; }
</style>
