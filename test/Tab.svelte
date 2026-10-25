<script lang="ts">
	import { on_window_key, type GpuixEvent } from 'gpuix-svelte';

	const log = $state<string[]>([]);

	$effect(() => on_window_key('keydown', (e: GpuixEvent) => log.push(`window:${e.key}${e.defaultPrevented ? '!' : ''}`)));

	function trap(e: GpuixEvent) {
		if (e.key === 'tab') e.preventDefault();
		log.push(`trap:${e.key}`);
	}

	function child(e: GpuixEvent) {
		if (e.key === 'x') e.stopPropagation();
		log.push(`child:${e.key}`);
	}
</script>

<div style="display: flex; flex-direction: column; gap: 8px; padding: 8px">
	<input testId="field" />
	<div tabindex="0" testId="trap" onkeydown={trap}>trap</div>
	<div tabindex="0" testId="parent" onkeydown={(e: GpuixEvent) => log.push(`parent:${e.key}`)}>
		<div tabindex="0" testId="child" onkeydown={child}>child</div>
	</div>
	<text testId="log">{log.join(' ')}</text>
</div>
