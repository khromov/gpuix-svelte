<script lang="ts">
	// Mounted on GPUI by test:style-props and in the DOM by test:dom, which expect the same of it.
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import ScopedCard from './ScopedCard.svelte';
	import StylePropsPass from './StylePropsPass.svelte';
	import StylePropsText from './StylePropsText.svelte';

	let rows = $state([
		{ id: 'r', tint: '#ff0000' },
		{ id: 'g', tint: '#00ff00' },
		{ id: 'b', tint: '#0000ff' }
	]);
	let shown = $state(true);
	let more = $state(false);
	let tint = $state<string | null>('#123456');

	export const reverse = () => (rows = rows.toReversed());
	export const prepend = () => rows.unshift({ id: 'n', tint: '#ffffff' });
	export const toggle = () => (shown = !shown);
	export const expand = () => (more = !more);
	export const recolor = (value: string | null) => (tint = value);
</script>

<div class="page">
	<div class="row" testId="plain">
		<div class="fixed"></div>
		<ScopedCard id="p" />
		<div class="fixed"></div>
	</div>
	<div class="row" testId="styled">
		<div class="fixed"></div>
		<ScopedCard id="s" --tint="#cc0000" />
		<div class="fixed"></div>
	</div>
	<div class="row" testId="list">
		{#each rows as row (row.id)}
			<ScopedCard id={row.id} --tint={row.tint} />
		{/each}
	</div>
	<div class="row" testId="deep">
		<div class="fixed" testId="deep-first"></div>
		{#each rows as row (row.id)}
			<StylePropsPass id="deep-{row.id}" --tint={row.tint} />
		{/each}
		<div class="fixed" testId="deep-last"></div>
	</div>
	<div class="row" testId="cond">
		<div class="fixed" testId="first"></div>
		{#if shown}<ScopedCard id="shown" {more} --tint={tint} />{/if}
		<div class="fixed" testId="last"></div>
	</div>
	<div class="row" style="--tint: #aaaaaa; --base: #dddddd">
		<ScopedCard id="inherits" />
		<ScopedCard id="overrides" --tint="#bbbbbb" />
		<ScopedCard id="slotted" --tint="#cccccc"><div class="slot" testId="slot"></div></ScopedCard>
		<ScopedCard id="reads-around" --tint="var(--base)" />
	</div>
	<text testId="label-plain"><StylePropsText text="plain" /></text>
	<text testId="label-styled"><StylePropsText text="styled" --tint="#010203" /></text>
	{#if shown}<Portal --tint="#abcdef"><div class="slot" testId="ported"></div></Portal>{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 10px;
		width: 600px;
	}
	.fixed {
		width: 50px;
		height: 20px;
		flex-shrink: 0;
	}
	.slot {
		color: var(--tint, #000002);
		width: 4px;
		height: 4px;
	}
</style>
