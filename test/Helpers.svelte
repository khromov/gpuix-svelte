<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';

	let { trail }: { trail: string[] } = $props();

	let hovered = $state('none');
	let covered = $state('no');
	let pad = $state<string[]>([]);
	let field = $state('');
	let key_up = $state('');
	let key_held = $state('');
	let moving = $state(false);
	let laid = $state('no');
	let landed = $state('no');
	let wheeled = $state('none');
	let status = $state('waiting');
	let swatch = $state('#333');
	const focusables = ['a', 'b'] as const;
	const focus_count = $state({ a: [0, 0], b: [0, 0] });
	const rows = Array.from({ length: 10 }, (_, i) => i);

	const held = (e: GpuixEvent) => (e.modifiers?.shift ? '+shift' : '');
	const at = (e: GpuixEvent) => `${Math.round(e.x ?? -1)},${Math.round(e.y ?? -1)}`;

	function pad_down(e: GpuixEvent) {
		pad = [`down:${e.button}${held(e)}`];
		trail.push(`down@${at(e)}`);
	}

	function pad_move(e: GpuixEvent) {
		if (pad.length > 0) pad.push(`move:${e.pressedButton ?? '-'}${held(e)}`);
		trail.push(`move@${at(e)}`);
	}

	function pad_up(e: GpuixEvent) {
		pad.push(`up:${e.button}${held(e)}`);
		trail.push(`up@${at(e)}`);
	}

	const timer = setTimeout(() => (status = 'ready'), 200);
	onDestroy(() => clearTimeout(timer));

	export const paint_swatch = (colour: string) => (swatch = colour);
</script>

<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px; width: 380px">
	<div testid="hover" style="width: 120px; height: 24px; background-color: #333" onmouseenter={() => (hovered = 'in')} onmouseleave={() => (hovered = 'out')}>
		<text>{`hover: ${hovered}`}</text>
	</div>
	<div
		testid="pad"
		style="width: 200px; height: 40px; flex-shrink: 0; background-color: #222"
		onmouseenter={() => trail.push('enter')}
		onmousedown={pad_down}
		onmousemove={pad_move}
		onmouseup={pad_up}
	></div>
	<text testid="pad-log">{pad.join(' ')}</text>
	<input
		testid="field"
		style="width: 200px; height: 24px"
		onchange={(e) => (field = e.value)}
		onkeydown={(e: GpuixEvent) => (key_held = e.isHeld ? 'yes' : 'no')}
		onkeyup={(e: GpuixEvent) => (key_up = e.key ?? '')}
	/>
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
			onlayout={() => (laid = 'yes')}
			onmotioncomplete={() => (landed = 'yes')}
		></div>
	{/if}
	<div testid="column" style="height: 60px; overflow: scroll; display: flex; flex-direction: column" onscroll={(e: GpuixEvent) => (wheeled = `${e.deltaX},${e.deltaY}${held(e)}`)}>
		{#each rows as i (i)}
			<text style="height: 20px; width: 600px">{`row ${i}`}</text>
		{/each}
	</div>
	<text>{status}</text>
	<div style="position: absolute; top: 0; left: 390px; width: 200px; display: flex; flex-direction: column">
		<text>{`covered: ${covered}`}</text>
		<text>{`laid: ${laid}`}</text>
		<text>{`landed: ${landed}`}</text>
		<text>{`wheeled: ${wheeled}`}</text>
		<text>{`held: ${key_held}`}</text>
		<div testid="content">one <text>two</text><div><text>three</text> four</div></div>
	</div>
	<div testid="far" style="position: absolute; top: 5000px; left: 0; width: 20px; height: 20px"></div>
	<div testid="far-right" style="position: absolute; top: 0; left: 5000px; width: 20px; height: 20px"></div>
	<div testid="far-left" style="position: absolute; top: 0; left: -5000px; width: 20px; height: 20px"></div>
	<div testid="far-up" style="position: absolute; top: -5000px; left: 0; width: 20px; height: 20px"></div>
	<div style="position: absolute; top: 400px; left: 300px; display: flex; gap: 4px">
		{#each focusables as name (name)}
			<div testid={`focus-${name}`} tabindex="0" style="width: 10px; height: 10px" onfocus={() => focus_count[name][0]++} onblur={() => focus_count[name][1]++}></div>
		{/each}
		<text testid="focus-log">{`a:${focus_count.a.join('/')} b:${focus_count.b.join('/')}`}</text>
	</div>
	<div style="position: absolute; top: 440px; left: 300px; width: 20px; height: 20px">
		<div testid="covered" style="width: 20px; height: 20px; background-color: #333" onmouseenter={() => (covered = 'yes')}></div>
		<div style="position: absolute; top: 0; left: 0; width: 20px; height: 20px; background-color: #555"></div>
	</div>
	<div style="position: absolute; top: 440px; left: 200px; display: flex">
		<Tooltip content="tip" delay={0} testid="exit">
			<text>tooltip</text>
		</Tooltip>
	</div>
	<div style="position: absolute; top: 470px; left: 300px; width: 20px; height: 20px" style:background-color={swatch}></div>
</div>
