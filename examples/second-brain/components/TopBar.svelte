<script>
	import { back, can_back } from '../lib/router.svelte.js';
	import { focus, ui } from '../lib/ui.svelte.js';
	import IconButton from './IconButton.svelte';
	import SearchBar from './SearchBar.svelte';

</script>

<div class="bar">
	{#if can_back()}
		<IconButton
			icon="back"
			size={30}
			onclick={() => {
				back();
				focus('root');
			}}
			testid="back"
		/>
	{/if}
	<div class="title">{ui.title}</div>
	<SearchBar />
</div>

<style>
	.bar { display: flex; flex-direction: row; align-items: center; gap: 12px; height: 56px; min-height: 56px; padding: 0 20px; border-bottom-width: 1px; user-select: none; border-color: var(--divider); }
	.title { width: 160px; min-width: 120px; font-size: 15px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
</style>
