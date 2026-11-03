<script module>
	export * from './HotStar.svelte';
	export { default as Named } from './HotNamed.svelte';
</script>

<script lang="ts">
	import type { AnyComponent } from 'gpuix-svelte';
	import Static from './HotChild.svelte';
	import './HotSideEffect.svelte';
	import '/abs/HotAbsolute.svelte';
	import 'file:///abs/HotFile.svelte';
	import './ModuleStore.svelte.ts';
	import Shipped from 'gpuix-svelte/components/Scroller.svelte';

	// import Commented from './HotComment.svelte';
	const sample = "import Doc from './HotString.svelte'";
	const path = './HotPath.svelte';

	let loaded = $state<AnyComponent | null>(null);
	const lazy = async () => (loaded = (await import('./HotLazy.svelte')).default);
</script>

<div>{typeof Static === 'function' ? 'static' : ''}{loaded ? 'lazy' : ''}{typeof lazy === 'function' ? '' : ''}{sample ? '' : ''}{path ? '' : ''}{typeof Shipped === 'function' ? '' : ''}</div>
