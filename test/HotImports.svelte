<script lang="ts">
	import type { AnyComponent } from 'gpuix-svelte';
	import Static from './HotChild.svelte';
	import './HotSideEffect.svelte';
	import Shipped from 'gpuix-svelte/components/Scroller.svelte';

	// import Commented from './HotComment.svelte';
	const sample = "import Doc from './HotString.svelte'";

	let loaded = $state<AnyComponent | null>(null);
	const lazy = async () => (loaded = (await import('./HotLazy.svelte')).default);
</script>

<div>{Static ? 'static' : ''}{loaded ? 'lazy' : ''}{lazy ? '' : ''}{sample ? '' : ''}{Shipped ? '' : ''}</div>
