<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { GpuixEvent } from 'gpuix-svelte';

	let hovered = $state('none');
	let pad = $state<string[]>([]);
	let field = $state('');
	let key_up = $state('');
	let moving = $state(false);
	let status = $state('waiting');
	const focusables = ['a', 'b'] as const;
	const focus_count = $state({ a: [0, 0], b: [0, 0] });
	const rows = Array.from({ length: 10 }, (_, i) => i);

	const timer = setTimeout(() => (status = 'ready'), 200);
	onDestroy(() => clearTimeout(timer));
</script>

<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px; width: 380px">
	<div testid="hover" style="width: 120px; height: 24px; background-color: #333" onmouseenter={() => (hovered = 'in')} onmouseleave={() => (hovered = 'out')}>
		<text>{`hover: ${hovered}`}</text>
	</div>
	<div
		testid="pad"
		style="width: 200px; height: 40px; background-color: #222"
		onmousedown={(e: GpuixEvent) => (pad = [`down:${e.button}`])}
		onmousemove={(e: GpuixEvent) => pad.length > 0 && pad.push(`move:${e.pressedButton ?? '-'}`)}
		onmouseup={(e: GpuixEvent) => pad.push(`up:${e.button}`)}
	></div>
	<text testid="pad-log">{pad.join(' ')}</text>
	<input testid="field" style="width: 200px; height: 24px" onchange={(e) => (field = e.value)} onkeyup={(e: GpuixEvent) => (key_up = e.key ?? '')} />
	<text>{`field: ${field} up: ${key_up}`}</text>
	<text testid="line-1" style="width: 200px">alpha beta</text>
	<text testid="line-2" style="width: 200px">gamma delta</text>
	<text testid="highlight" style="width: 200px" highlight={{ query: 'needle' }}>find the needle here</text>
	<div testid="start" style="width: 60px; height: 16px; background-color: #333" onclick={() => (moving = true)}></div>
	{#if moving}
		<div
			testid="mover"
			style="position: relative; width: 20px; height: 10px; background-color: #444"
			motion={{ initial: { left: 0 }, animate: { left: 200 }, transition: { duration: 1, ease: 'linear' } }}
		></div>
	{/if}
	<div testid="column" style="height: 60px; overflow: scroll; display: flex; flex-direction: column">
		{#each rows as i (i)}
			<text style="height: 20px">{`row ${i}`}</text>
		{/each}
	</div>
	<text>{status}</text>
	<div testid="far" style="position: absolute; top: 900px; left: 0; width: 20px; height: 20px"></div>
	<div style="position: absolute; top: 400px; left: 300px; display: flex; gap: 4px">
		{#each focusables as name (name)}
			<div testid={`focus-${name}`} tabindex="0" style="width: 10px; height: 10px" onfocus={() => focus_count[name][0]++} onblur={() => focus_count[name][1]++}></div>
		{/each}
		<text testid="focus-log">{`a:${focus_count.a.join('/')} b:${focus_count.b.join('/')}`}</text>
	</div>
</div>
