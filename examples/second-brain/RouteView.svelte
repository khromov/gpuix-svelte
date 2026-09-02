<script lang="ts">
	import type { Component } from 'svelte';
	import { resolve, route, type RouteEntry } from './lib/router.svelte.ts';
	import { ui } from './lib/ui.svelte.ts';

	let { routes }: { routes: RouteEntry[] } = $props();

	// Component-local, so a hot remount imports the busted specifiers afresh.
	type Page = Component<any, any, any>;
	const loaded = new Map<RouteEntry, Page | Promise<Page>>();
	const match = $derived(resolve(routes, route.path));

	$effect(() => {
		route.params = match.params;
		ui.title = match.route.title;
	});

	const page = $derived.by(() => {
		const r = match.route;
		if (!loaded.has(r)) {
			loaded.set(
				r,
				r.load().then((m) => {
					loaded.set(r, m.default);
					return m.default;
				})
			);
		}
		return loaded.get(r);
	});
</script>

{#key route.path}
	{#await page then Page}
		<Page {...match.route.props ?? {}} params={match.params} query={route.query} />
	{/await}
{/key}
