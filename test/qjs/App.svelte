<script lang="ts">
	// The label is what test/qjs.ts edits in its copy of this file: a remount
	// that picked up the edit shows LABEL_V2.
	let count = $state(0);
	const label = 'LABEL_V1';

	$effect(() => {
		console.log(`[qjs-test] count=${count}`);
	});
	console.log(`[qjs-test] label=${label}`);
</script>

<div
	tabindex={0}
	autofocus
	onkeydown={() => count++}
	style="display: flex; flex-direction: column; gap: 12px; padding: 24px; width: 100%; height: 100%; background-color: #11111b"
>
	<div style="font-size: 32px; color: #cdd6f4">{count}</div>
	<div style="color: #a6adc8">{label}</div>
</div>
