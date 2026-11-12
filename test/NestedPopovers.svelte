<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';

	let outer = $state(false);
	let inner = $state(false);

	export function open_both() {
		outer = true;
		inner = true;
	}

	export const read = () => [outer, inner];
</script>

<div style="display: flex; flex-direction: column; padding: 40px; width: 100%; height: 100%">
	<Popover open={outer} onclose={() => (outer = false)} testid="outer">
		<div style="width: 60px; height: 20px">Outer</div>
		{#snippet content()}
			<Popover open={inner} onclose={() => (inner = false)} testid="inner">
				<div style="width: 60px; height: 20px">Inner</div>
				{#snippet content()}<div style="width: 60px; height: 20px">deep</div>{/snippet}
			</Popover>
		{/snippet}
	</Popover>
</div>
