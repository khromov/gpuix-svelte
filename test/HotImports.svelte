<script>
	import Static from './HotChild.svelte';
	import './HotSideEffect.svelte';

	let loaded = $state(null);
	const lazy = async () => (loaded = (await import('./HotLazy.svelte')).default);
</script>

<div>{Static ? 'static' : ''}{loaded ? 'lazy' : ''}{lazy ? '' : ''}</div>
