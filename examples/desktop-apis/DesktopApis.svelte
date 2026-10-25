<script lang="ts">
	import { readFileSync } from 'node:fs';
	import {
		set_css_vars,
		minimize_window,
		zoom_window,
		toggle_fullscreen,
		prompt_for_paths,
		on_selection_change,
		scroll_into_view,
		focus_next_within,
		focus_previous_within,
		set_image,
		set_image_pixels,
		type GpuixEvent,
		type ShadowNode
	} from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import { onDestroy } from 'svelte';

	set_css_vars({
		bg: '#11111b',
		card: '#1e1e2e',
		well: '#181825',
		raised: '#313244',
		hover: '#45475a',
		ink: '#cdd6f4',
		faint: '#7f849c',
		accent: '#89b4fa',
		ok: '#a6e3a1'
	});

	const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico)$/i;

	let paths = $state<string[]>([]);
	let picker_note = $state('');
	let drop_note = $state('Drop files from Finder here');
	let preview: ShadowNode | null = null;

	async function choose() {
		try {
			const picked = await prompt_for_paths({ files: true, multiple: true, prompt: 'Show' });
			picker_note = picked ? `${picked.length} picked` : 'cancelled';
			if (picked) paths = picked;
		} catch (error) {
			picker_note = (error as Error).message;
		}
	}

	function dropped(e: GpuixEvent) {
		paths = e.paths ?? [];
		drop_note = `${paths.length} dropped at (${Math.round(e.x ?? 0)}, ${Math.round(e.y ?? 0)})`;
	}

	const first_image = $derived(paths.find((p) => IMAGE.test(p)) ?? null);

	// The bytes go straight to native, so the image never becomes a data URL in a mutation.
	$effect(() => {
		if (first_image && preview) set_image(preview, readFileSync(first_image));
	});

	const WAVE_W = 760;
	const WAVE_H = 140;
	let wave: ShadowNode | null = null;
	const pixels = new Uint8Array(WAVE_W * WAVE_H * 4);

	function paint_wave(t: number) {
		pixels.fill(0);
		for (let x = 0; x < WAVE_W; x++) {
			const amp = Math.abs(Math.sin(x / 37 + t) * Math.sin(x / 11 - t * 1.7)) * (WAVE_H / 2 - 4);
			const top = Math.round(WAVE_H / 2 - amp);
			const bottom = Math.round(WAVE_H / 2 + amp);
			for (let y = top; y <= bottom; y++) {
				const i = (y * WAVE_W + x) * 4;
				pixels[i] = 137;
				pixels[i + 1] = 180 - Math.round((60 * Math.abs(y - WAVE_H / 2)) / (WAVE_H / 2));
				pixels[i + 2] = 250;
				pixels[i + 3] = 255;
			}
		}
		set_image_pixels(wave, WAVE_W, WAVE_H, pixels);
	}

	$effect(() => {
		const started = performance.now();
		const timer = setInterval(() => paint_wave((performance.now() - started) / 600), 50);
		return () => clearInterval(timer);
	});

	let selected = $state('');
	onDestroy(on_selection_change((e) => (selected = e.value ?? '')));

	const ROWS = Array.from({ length: 60 }, (_, i) => i + 1);
	const row_nodes: ShadowNode[] = [];
	let target = $state(0);

	function jump(n: number) {
		target = n;
		scroll_into_view(row_nodes[n - 1]);
	}

	const CHIPS = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Trash'];
	let chips: ShadowNode | null = null;
	let focused = $state('none yet');

	let open = $state(false);
	let landings = $state(0);
	let hidden = $state(false);
	let notes = $state('Enter makes a new line here:\n');
</script>

<div class="page">
	<Scroller gap={16} pad="20px 24px">
		<text class="title" role="heading" aria-level="1">Desktop APIs</text>
		<text class="faint">What @gpuix/native 0.8–0.10 added, through gpuix-svelte's helpers.</text>

		<div class="grid">
			<div class="card">
				<text class="heading" role="heading" aria-level="2">Window</text>
				<text class="faint">minimize_window(), zoom_window(), toggle_fullscreen()</text>
				<div class="row">
					<div class="btn" role="button" aria-label="Minimize window" onclick={minimize_window}><text>Minimize</text></div>
					<div class="btn" role="button" aria-label="Zoom window" onclick={zoom_window}><text>Zoom</text></div>
					<div class="btn" role="button" aria-label="Toggle fullscreen" onclick={toggle_fullscreen}><text>Fullscreen</text></div>
				</div>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">Accessibility and motion</text>
				<text class="faint">role and aria-* reach VoiceOver; onmotioncomplete fires when a track lands</text>
				<div class="row">
					<div
						class="toggle"
						role="switch"
						aria-label="Show details"
						aria-expanded={open}
						hitbox="self"
						onclick={() => (open = !open)}
					>
						<div
							class="knob"
							motion={{ initial: false, animate: { left: open ? 22 : 2 }, transition: { duration: 0.2, ease: 'easeOut' } }}
							onmotioncomplete={() => landings++}
						></div>
					</div>
					<text>{`aria-expanded={${open}} · landed ${landings}×`}</text>
				</div>
				{#if open}
					<text class="faint">Open Accessibility Inspector and point it at this window.</text>
				{/if}
			</div>

			<div class="card wide">
				<text class="heading" role="heading" aria-level="2">Files</text>
				<text class="faint">prompt_for_paths() opens the system picker; onfiledrop takes Finder drops. Images preview through set_image().</text>
				<div class="row">
					<div class="btn primary" role="button" aria-label="Choose files" onclick={choose}><text>Choose files…</text></div>
					<text class="faint">{picker_note}</text>
				</div>
				<div class="drop" onfiledrop={dropped} aria-label="Drop zone" role="region">
					<text>{drop_note}</text>
				</div>
				{#each paths as path (path)}
					<text class="mono">{path}</text>
				{/each}
				{#if first_image}
					<img {@attach (n: ShadowNode) => void (preview = n)} class="preview" objectFit="contain" alt="Preview of the first image" />
				{/if}
			</div>

			<div class="card wide">
				<text class="heading" role="heading" aria-level="2">Live pixels</text>
				<text class="faint">set_image_pixels() uploads raw RGBA every 50 ms: a 2× bitmap in a 380×70 box, no data URL</text>
				<img {@attach (n: ShadowNode) => void (wave = n)} class="wave" alt="Animated waveform" />
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">Selection</text>
				<text class="faint">on_selection_change() hears the window's text selection</text>
				<text class="para">
					Drag across this paragraph to select some of it. Every change to the selection, a clear included, reaches the handler once.
				</text>
				<text class="mono">{selected ? `"${selected}" (${selected.length} chars)` : 'nothing selected'}</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">scroll_into_view()</text>
				<text class="faint">scrolls the nearest scroll container until the row shows</text>
				<div class="row">
					{#each [1, 30, 60] as n (n)}
						<div class="btn" role="button" onclick={() => jump(n)}><text>{`Row ${n}`}</text></div>
					{/each}
					<div class="btn" role="button" onclick={() => jump(1 + Math.floor(Math.random() * ROWS.length))}><text>Random</text></div>
				</div>
				<div class="list">
					{#each ROWS as n (n)}
						<text {@attach (node: ShadowNode) => void (row_nodes[n - 1] = node)} class={n === target ? 'item hit' : 'item'}>{`Row ${n}`}</text>
					{/each}
				</div>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">Focus walk</text>
				<text class="faint">focus_next_within() / focus_previous_within() cycle the tab stops inside one element</text>
				<div class="row">
					<div class="btn" role="button" aria-label="Previous folder" onclick={() => focus_previous_within(chips)}><text>◀</text></div>
					<div class="row" {@attach (n: ShadowNode) => void (chips = n)}>
						{#each CHIPS as chip (chip)}
							<div class="chip" tabindex="0" role="button" aria-label={chip} onfocus={() => (focused = chip)}><text>{chip}</text></div>
						{/each}
					</div>
					<div class="btn" role="button" aria-label="Next folder" onclick={() => focus_next_within(chips)}><text>▶</text></div>
				</div>
				<text class="mono">{`focused: ${focused}`}</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">Text and images</text>
				<text class="faint">text-decoration, visibility, http(s) img, and Enter in a textarea</text>
				<div class="row">
					<text class="underline">underline</text>
					<text class="struck">line-through</text>
					<div class="btn" role="button" onclick={() => (hidden = !hidden)}><text>{hidden ? 'Show' : 'Hide'}</text></div>
					<text class="tag" style:visibility={hidden ? 'hidden' : 'visible'}>keeps its box</text>
					<text class="faint">←</text>
				</div>
				<div class="row">
					<img class="avatar" src="https://github.com/sveltejs.png" objectFit="cover" alt="The Svelte organisation's avatar" />
					<text class="faint">fetched over https by GPUI</text>
				</div>
				<textarea class="field" value={notes} minRows={3} maxRows={6} onchange={(e: GpuixEvent) => (notes = e.value ?? '')}></textarea>
			</div>
		</div>
	</Scroller>
</div>

<style>
	.page { display: flex; flex-direction: column; width: 100%; height: 100%; background-color: var(--bg); color: var(--ink); font-size: 14px; }
	.title { font-size: 26px; font-weight: bold; }
	.heading { font-size: 16px; font-weight: 600; }
	.faint { color: var(--faint); font-size: 12px; }
	.mono { font-family: Menlo; font-size: 12px; color: var(--ok); }
	.para { line-height: 20px; }
	.grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px; }
	.card { display: flex; flex-direction: column; gap: 10px; flex-basis: 400px; flex-grow: 1; padding: 16px; border-radius: 12px; background-color: var(--card); }
	.wide { width: 100%; }
	.row { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; }
	.btn { padding: 6px 12px; border-radius: 8px; background-color: var(--raised); cursor: pointer; user-select: none; }
	.btn:hover { background-color: var(--hover); }
	.primary { background-color: var(--accent); color: var(--bg); }
	.primary:hover { background-color: var(--ink); }
	.chip { padding: 4px 10px; border-radius: 12px; border-width: 1px; border-color: var(--hover); user-select: none; }
	.drop { display: flex; align-items: center; justify-content: center; height: 70px; border-radius: 10px; border-width: 2px; border-color: var(--hover); background-color: var(--well); color: var(--faint); }
	.preview { width: 240px; height: 160px; border-radius: 8px; }
	.wave { width: 380px; height: 70px; border-radius: 8px; background-color: var(--well); }
	.list { display: flex; flex-direction: column; height: 140px; overflow: scroll; border-radius: 8px; background-color: var(--well); pointer-events: auto; }
	.item { padding: 4px 10px; color: var(--faint); }
	.hit { color: var(--bg); background-color: var(--accent); }
	.toggle { position: relative; width: 44px; height: 24px; border-radius: 12px; background-color: var(--raised); cursor: pointer; }
	.knob { position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 10px; background-color: var(--accent); }
	.underline { text-decoration: underline; color: var(--accent); }
	.struck { text-decoration: line-through; color: var(--faint); }
	.tag { padding: 2px 8px; border-radius: 6px; background-color: var(--raised); }
	.avatar { width: 40px; height: 40px; border-radius: 8px; }
	.field { padding: 8px; border-radius: 8px; background-color: var(--well); font-size: 13px; line-height: 18px; }
</style>
