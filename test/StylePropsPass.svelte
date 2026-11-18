<script lang="ts">
	// Its root is another component given style props, so two wrappers sit one inside the other.
	import ScopedCard from './ScopedCard.svelte';

	let { id }: { id: string } = $props();
</script>

<ScopedCard {id} --unused="1px" />
