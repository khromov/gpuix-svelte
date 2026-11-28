<script lang="ts">
	import RtlText from 'gpuix-svelte/components/RtlText.svelte';

	let { text }: { text: string } = $props();
	let width = $state(240);

	export function resize(next: number) {
		width = next;
	}
</script>

<div testid="box" style:width="{width}px">
	<RtlText {text} style="font-size: 16px" />
</div>
