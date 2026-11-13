<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { RouteProps } from 'gpuix-svelte-ui/router';

	// A screen written as a snippet (`screen(home)` in the table), rendered as a component so the Router treats both alike.
	let { render, params, query }: { render: Snippet<[RouteProps]>; params: Record<string, string>; query: Record<string, string> } = $props();
</script>

{@render render({ params, query })}
