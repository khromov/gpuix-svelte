<script>
	import { resolve, route } from './lib/router.svelte.js';
	import { ui } from './lib/ui.svelte.js';

	let { routes } = $props();

	// Component-local, so a hot remount imports the busted specifiers afresh.
	const loaded = new Map();
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
