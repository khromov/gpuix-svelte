<script lang="ts">
	import type { Component } from 'svelte';
	import Static from './HotChild.svelte';
	import './HotSideEffect.svelte';
	import Shipped from 'gpuix-svelte/components/Scroller.svelte';

	// import Commented from './HotComment.svelte';
	const sample = "import Doc from './HotString.svelte'";

	let loaded = $state<Component<any, any, any> | null>(null);
	const lazy = async () => (loaded = (await import('./HotLazy.svelte')).default);
</script>

<div>{Static ? 'static' : ''}{loaded ? 'lazy' : ''}{lazy ? '' : ''}{sample ? '' : ''}{Shipped ? '' : ''}</div>
