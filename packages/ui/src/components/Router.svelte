<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { IS_GPUIX, on_window_key } from 'gpuix-svelte';
	import RouteSnippet from 'gpuix-svelte-ui/components/RouteSnippet.svelte';
	import { back, forward, router, start_router, use_routes, type Mode, type Route, type RouteTable } from 'gpuix-svelte-ui/router';
	import { test_id } from 'gpuix-svelte-ui/shared';

	let {
		routes,
		initial = '/',
		mode = 'history',
		layout = null,
		shortcuts = IS_GPUIX,
		testid = null
	}: {
		/** Patterns to screens: `{ '/': Home, '/items/:id': Item, '*': NotFound }`. */
		routes: RouteTable;
		/** The first screen of a window; a page starts from its URL. */
		initial?: string;
		/** How a page keeps the URL; a window is always `memory`. */
		mode?: Mode;
		/** Wraps every screen: `{#snippet layout(content, route)}<Sidebar />{@render content()}{/snippet}`. */
		layout?: Snippet<[Snippet, Route]> | null;
		/** ⌘[ / ⌘] and Alt+Left / Alt+Right go back and forward, unless a text field is being edited; on by default in a window, where nothing else provides them. */
		shortcuts?: boolean;
		testid?: string | null;
	} = $props();

	// Once per process: a later mount, a hot reload's, keeps the current screen, so only the first values count.
	start_router(untrack(() => ({ mode, initial })));
	// Before the first read of `router.params` below, then again whenever the table changes.
	use_routes(untrack(() => Object.keys(routes)));
	$effect.pre(() => use_routes(Object.keys(routes)));

	const Entry = $derived(router.pattern === null ? null : routes[router.pattern]);
	const screen_props = $derived({ params: router.params, query: router.query });
	const route = $derived<Route>({ path: router.path, href: router.href, query: router.query, params: router.params, pattern: router.pattern, state: router.state });

	$effect(() => {
		if (router.pattern === null) console.warn(`[gpuix-svelte-ui] no route matches ${router.path}; a '*' entry in the table would catch it`);
	});

	$effect(() => {
		if (!shortcuts) return;
		return on_window_key('keydown', (e) => {
			if (e.editing) return;
			const cmd = e.modifiers?.cmd === true;
			const alt_only = e.modifiers?.alt === true && !cmd && e.modifiers?.ctrl !== true;
			if ((cmd && e.key === '[') || (alt_only && e.key === 'left')) {
				e.preventDefault();
				back();
			} else if ((cmd && e.key === ']') || (alt_only && e.key === 'right')) {
				e.preventDefault();
				forward();
			}
		});
	});
</script>

{#snippet content()}
	{#key router.generation}
		{#if Entry !== null}
			{#if typeof Entry === 'function'}
				<Entry {...screen_props} />
			{:else}
				<RouteSnippet render={Entry.render} {...screen_props} />
			{/if}
		{/if}
	{/key}
{/snippet}

<div class="router" {...test_id(testid)}>
	{#if layout}
		{@render layout(content, route)}
	{:else}
		{@render content()}
	{/if}
</div>

<style>
	.router {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-width: 0;
		min-height: 0;
	}
</style>
