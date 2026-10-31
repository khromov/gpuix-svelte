<script lang="ts">
	import { host } from 'gpuix-svelte/embed';
	import { get_native, type ShadowNode } from 'gpuix-svelte';

	let { label = '' }: { label?: string } = $props();
	let clicks = $state(0);
	let thanks = $state('');
	let refused = $state('');
	let bounds = $state('');
	let root: ShadowNode | undefined;

	$effect(() =>
		host.on('tick', async (data) => {
			thanks = String(await host.call('report', (data as { n: number }).n));
			try {
				await host.call('missing');
			} catch (error) {
				refused = (error as Error).message;
			}
			const box = root?.nativeId != null ? get_native()?.getElementBounds(root.nativeId) : null;
			bounds = box ? `${box.width}x${box.height}` : 'none';
		})
	);
</script>

<div {@attach (node) => void (root = node)}>
	<text>{label}</text>
	<div onclick={() => clicks++}><text>{`clicked ${clicks}`}</text></div>
	<text>{`thanks: ${thanks}`}</text>
	<text>{`refused: ${refused}`}</text>
	<text>{`bounds: ${bounds}`}</text>
</div>
