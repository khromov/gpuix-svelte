<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';

	let log = $state('none');
</script>

<div class="pad">
	<div
		class="card"
		hitbox="self"
		testId="card"
		onclick={() => (log = 'click')}
		onauxclick={(e: GpuixEvent) => (log = `aux b=${e.button} r=${e.isRightClick} x=${Math.round(e.x ?? -1)} y=${Math.round(e.y ?? -1)} c=${e.clickCount} m=${JSON.stringify(e.modifiers)}`)}
		onmousedown={(e: GpuixEvent) => (log = `down:${e.button}`)}
	>
		<div class="badge" testId="badge">badge</div>
	</div>
	<div testId="log">{log}</div>
</div>

<style>
	.pad { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
	.card { display: flex; flex-direction: row; padding: 10px; background-color: #333333; }
	.badge { padding: 4px; background-color: #884444; }
</style>
