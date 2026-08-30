<script>
	import Static from './HotChild.svelte';
	import './HotSideEffect.svelte';

	// import Commented from './HotComment.svelte';
	const sample = "import Doc from './HotString.svelte'";

	let loaded = $state(null);
	const lazy = async () => (loaded = (await import('./HotLazy.svelte')).default);
</script>

<div>{Static ? 'static' : ''}{loaded ? 'lazy' : ''}{lazy ? '' : ''}{sample ? '' : ''}</div>
