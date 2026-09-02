<script>
	import { push, replace, route } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';
	import { focus, register } from '../lib/ui.svelte.js';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	const mode = $derived(resolved());
	let value = $state(route.query.q ?? '');
	let focused = $state(false);
	let timer = null;

	// Leaving the search route clears the box; typing on any route opens it.
	$effect(() => {
		if (route.path !== '/search') value = '';
		else if (route.query.q !== undefined && route.query.q !== value) value = route.query.q;
	});

	function navigate(q) {
		const href = `/search?q=${encodeURIComponent(q)}`;
		if (route.path === '/search') replace(href);
		else push(href);
	}

	function change(text) {
		value = text;
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (value.trim()) navigate(value.trim());
		}, 200);
	}

	function submit(text) {
		clearTimeout(timer);
		value = text;
		if (value.trim()) navigate(value.trim());
	}

	function clear() {
		clearTimeout(timer);
		value = '';
		focus('root');
	}
</script>

<div class="search {mode}" class:focused>
	<Icon name="search" size={15} tone="faint" />
	<input
		{@attach (node) => register('search', node)}
		{value}
		placeholder="Search your brain…"
		class="input {mode}"
		onchange={(e) => change(e.value)}
		onsubmit={(e) => submit(e.value)}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		onkeydown={(e) => {
			if (e.key === 'escape') clear();
		}}
		testId="search-input"
	/>
	{#if value}
		<IconButton icon="x" size={22} onclick={clear} />
	{:else}
		<div class="hint {mode}">⌘K</div>
	{/if}
</div>

<style>
	.search { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-grow: 1; min-width: 0; padding: 6px 8px 6px 12px; border-radius: 8px; border-width: 1px; }
	.search.light { background-color: #fbf7ef; border-color: #e2d8c4; color: #9b9080; }
	.search.focused.light { border-color: #5f7a4a; background-color: #ffffff; }
	.search.dark { background-color: #151210; border-color: #36302a; color: #7b7163; }
	.search.focused.dark { border-color: #8fae74; }
	.input { flex-grow: 1; min-width: 0; font-size: 13px; line-height: 18px; }
	.input.light { color: #2a251f; }
	.input.dark { color: #ece3d3; }
	.hint { padding: 1px 6px; border-radius: 4px; border-width: 1px; font-size: 10px; line-height: 14px; font-family: Lilex; pointer-events: none; user-select: none; }
	.hint.light { border-color: #e2d8c4; color: #9b9080; }
	.hint.dark { border-color: #36302a; color: #7b7163; }
</style>
