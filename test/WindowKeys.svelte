<script>
	import { on_window_key } from 'gpuix-svelte';

	let seen = $state([]);
	let field_keys = $state(0);

	$effect(() => on_window_key('keydown', (e) => seen.push(`${e.modifiers?.cmd ? 'cmd-' : ''}${e.key}${e.editing ? '*' : ''}`)));
</script>

<div style="display: flex; flex-direction: column; gap: 8px; padding: 8px">
	<input testId="field" onkeydown={() => field_keys++} />
	<div tabindex="0" testId="other">other</div>
	<div testId="seen">{seen.join(' ')}|{field_keys}</div>
</div>
