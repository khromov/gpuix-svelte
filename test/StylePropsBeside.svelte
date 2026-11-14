<script lang="ts">
	// Its only element is a <text>, so the compiler takes the whole fragment for SVG and wraps the component in a <g>.
	import ScopedCard from './ScopedCard.svelte';
</script>

<text testId="beside-label">beside</text>
<ScopedCard id="beside" --tint="#040506" />
