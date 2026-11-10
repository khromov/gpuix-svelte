<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';

	let clicks = $state(0);
	let off = $state(true);
	let swallow = $state(false);

	function keys(e: GpuixEvent) {
		if (swallow && e.key === 'enter') e.preventDefault();
	}
</script>

<div style="display: flex; flex-direction: column; gap: 8px; padding: 8px">
	<button testId="plain" onclick={() => clicks++} onkeydown={keys}>Save</button>
	<button testId="off" disabled={off} onclick={() => clicks++}>Delete</button>
	<button testId="tab" role="tab" onclick={() => clicks++}>Files</button>
	<div testId="div" onclick={() => clicks++}>Plain</div>
	<div testId="enable" onclick={() => (off = !off)}>enable</div>
	<div testId="swallow" onclick={() => (swallow = !swallow)}>swallow</div>
	<text testId="clicks">{clicks}</text>
</div>
