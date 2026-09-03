<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';

	let log = $state('none');

	const note = (e: GpuixEvent) => (log = `${e.type} right=${e.isRightClick ?? false} ctrl=${e.modifiers?.ctrl ?? false} at=${Math.round(e.x ?? -1)},${Math.round(e.y ?? -1)}`);
</script>

<div class="pad">
	<div class="card" hitbox="self" testId="card" onclick={note} onauxclick={note}>
		<div class="badge" testId="badge">badge</div>
	</div>
	<div class="card" hitbox="self" testId="host" onclick={note} onauxclick={note}>
		<div class="inner" testId="inner" onclick={() => (log = 'inner click')} onauxclick={() => (log = 'inner aux')}>inner</div>
	</div>
	<div testId="log">{log}</div>
</div>

<style>
	.pad { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
	.card { display: flex; flex-direction: row; padding: 10px; background-color: #333333; }
	.badge { padding: 4px; background-color: #884444; }
	.inner { padding: 4px; background-color: #446688; }
</style>
