<script lang="ts">
	import { readFileSync } from 'node:fs';
	import {
		set_css_vars,
		set_keyboard_focus_dim,
		set_image_pixels,
		register_font,
		elements_at,
		prompt_for_paths,
		scroll_into_view,
		on_window_key,
		type GpuixEvent,
		type ShadowNode
	} from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import { onDestroy } from 'svelte';
	import { font_family } from './font.ts';

	set_css_vars({
		bg: '#11111b',
		card: '#1e1e2e',
		well: '#181825',
		raised: '#313244',
		hover: '#45475a',
		ink: '#cdd6f4',
		faint: '#7f849c',
		accent: '#89b4fa',
		ok: '#a6e3a1',
		warn: '#f9e2af'
	});

	const PLATFORMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows' };
	const display =
		process.platform === 'linux' ? `Linux under ${process.env.WAYLAND_DISPLAY ? 'Wayland' : 'X11'}` : (PLATFORMS[process.platform] ?? process.platform);

	let focused = $state('nothing yet');
	let dim = $state(false);

	function toggle_dim() {
		dim = !dim;
		set_keyboard_focus_dim(dim);
	}

	let trap = $state(false);
	let keys = $state<string[]>([]);
	let dialog = $state(false);

	const describe = (where: string, e: GpuixEvent) => `${where} keyDown ${e.key} #${e.keystrokeId ?? '-'}${e.defaultPrevented ? ' prevented' : ''}`;
	const log_key = (line: string) => (keys = [line, ...keys].slice(0, 5));

	function trapped(e: GpuixEvent) {
		if (trap && e.key === 'tab') e.preventDefault();
		log_key(describe('trap', e));
	}

	onDestroy(
		on_window_key('keydown', (e) => {
			if (e.key === 'escape') dialog = false;
			log_key(describe('window', e));
		})
	);

	let wide = $state(false);
	let size = $state('not laid out yet');
	let wheel = $state(0);
	let offset = $state(0);
	const ROWS = Array.from({ length: 40 }, (_, i) => i + 1);
	const rows: ShadowNode[] = [];

	let stack = $state<string[]>([]);

	function probe(e: GpuixEvent) {
		stack = elements_at(e.x ?? 0, e.y ?? 0).map((n) => (n.kind === 'text' ? 'text' : String(n.attrs['aria-label'] ?? n.name)));
	}

	let family = $state<string | null>(null);
	let font_note = $state('Nothing loaded, so the line below uses the default font');

	async function load_font() {
		try {
			const picked = await prompt_for_paths({ files: true, multiple: false, prompt: 'Load font' });
			if (!picked?.[0]) return;
			const bytes = readFileSync(picked[0]);
			register_font(bytes);
			family = font_family(bytes);
			font_note = family ? `register_font() took "${family}"` : 'Registered, but its family name could not be read';
		} catch (error) {
			font_note = (error as Error).message;
		}
	}

	const PLASMA_W = 320;
	const PLASMA_H = 160;
	let plasma: ShadowNode | null = null;
	const bgra = new Uint8Array(PLASMA_W * PLASMA_H * 4);

	function paint_plasma(t: number) {
		for (let y = 0; y < PLASMA_H; y++) {
			for (let x = 0; x < PLASMA_W; x++) {
				const v = Math.PI * (Math.sin(x / 19 + t) + Math.sin(y / 13 - t * 1.3) + Math.sin((x + y) / 29 + t * 0.7));
				const i = (y * PLASMA_W + x) * 4;
				bgra[i] = 128 + 127 * Math.sin(v);
				bgra[i + 1] = 128 + 127 * Math.sin(v + 2);
				bgra[i + 2] = 128 + 127 * Math.sin(v + 4);
				bgra[i + 3] = 255;
			}
		}
		set_image_pixels(plasma, PLASMA_W, PLASMA_H, bgra, 'bgra');
	}

	$effect(() => {
		const started = performance.now();
		const timer = setInterval(() => paint_plasma((performance.now() - started) / 700), 50);
		return () => clearInterval(timer);
	});
</script>

<div class="page">
	<Scroller gap={16} pad="20px 24px">
		<text class="title" role="heading" aria-level="1">What's new in @gpuix/native 0.11</text>
		<text class="faint">{`Running on ${display}. Press Tab to walk the page; Shift+Tab walks back.`}</text>

		<div class="grid">
			<div class="card">
				<text class="heading" role="heading" aria-level="2">Keyboard focus</text>
				<text class="faint">:focus-visible rules and the focus-visible attribute apply after keyboard focus only, drawn with outline-*</text>
				<div class="row">
					{#each ['One', 'Two', 'Three'] as label (label)}
						<div class="btn" tabindex="0" role="button" aria-label={label} onfocus={() => (focused = label)}><text>{label}</text></div>
					{/each}
					<div
						class="btn"
						tabindex="0"
						role="button"
						aria-label="Inline override"
						focus-visible="outline-color: #f9e2af; outline-width: 3px"
						onfocus={() => (focused = 'Inline override')}
					>
						<text>focus-visible="…"</text>
					</div>
				</div>
				<div class="row">
					<div
						class="switch"
						tabindex="0"
						role="switch"
						aria-label="Keyboard focus dim"
						aria-expanded={dim}
						hitbox="self"
						onclick={toggle_dim}
						onkeydown={(e: GpuixEvent) => e.key === 'space' && toggle_dim()}
					>
						<div class="knob" motion={{ initial: false, animate: { left: dim ? 22 : 2 }, transition: { duration: 0.15, ease: 'easeOut' } }}></div>
					</div>
					<text>{`set_keyboard_focus_dim(${dim})`}</text>
				</div>
				<text class="faint">With the dim on, every other focusable fades to 40% while one has keyboard focus. This one opts out:</text>
				<div class="row">
					<div class="btn steady" tabindex="0" role="button" aria-label="Never dims" onfocus={() => (focused = 'Never dims')}>
						<text>keyboard-focus-dim: false</text>
					</div>
				</div>
				<text class="mono">{`focused: ${focused}`}</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">Tab navigation</text>
				<text class="faint">Tab moves focus once every key handler ran, so preventDefault() keeps it; it never types into a field</text>
				<input class="field" placeholder="Type here, then Tab out: no tab character lands" />
				<div class="row">
					<div class={trap ? 'trap on' : 'trap'} tabindex="0" role="button" aria-label="Tab trap" onkeydown={trapped}>
						<text>{trap ? 'Tab stays here' : 'Tab passes through'}</text>
					</div>
					<div class="btn" tabindex="0" role="button" onclick={() => (trap = !trap)}><text>{trap ? 'Release Tab' : 'Trap Tab'}</text></div>
				</div>
				<text class="faint">The same keystrokeId ties an element's keyDown to the window's:</text>
				{#each keys as line, i (i)}
					<text class="mono">{line}</text>
				{:else}
					<text class="mono">no keys yet</text>
				{/each}
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">onlayout and onscrollchange</text>
				<text class="faint">onlayout reports the border box after the first paint and on every resize</text>
				<div class="row">
					<div class="btn" tabindex="0" role="button" onclick={() => (wide = !wide)}><text>{wide ? 'Narrow' : 'Widen'}</text></div>
					<div
						class="measured"
						style:width={wide ? '260px' : '140px'}
						onlayout={(e: GpuixEvent) => (size = `${Math.round(e.width ?? 0)} × ${Math.round(e.height ?? 0)}`)}
					>
						<text>{size}</text>
					</div>
				</div>
				<text class="faint">onscrollchange follows every move, scroll_into_view() included; onscroll hears only the wheel</text>
				<div class="row">
					{#each [1, 20, 40] as n (n)}
						<div class="btn" tabindex="0" role="button" onclick={() => scroll_into_view(rows[n - 1])}><text>{`Row ${n}`}</text></div>
					{/each}
					<text class="mono">{`scrollY ${offset} · wheel events ${wheel}`}</text>
				</div>
				<div class="list" onscroll={() => wheel++} onscrollchange={(e: GpuixEvent) => (offset = Math.round(e.scrollY ?? 0))}>
					{#each ROWS as n (n)}
						<text {@attach (node: ShadowNode) => void (rows[n - 1] = node)} class="item">{`Row ${n}`}</text>
					{/each}
				</div>
				<text class="faint">That thumb is GPUI's own: scrollbar-color and scrollbar-width</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">New styles</text>
				<div class="row">
					<div class="ratio"><text>aspect-ratio: 16 / 9</text></div>
					<div class="dashed"><text>border-style: dashed</text></div>
					<div class="outlined"><text>outline-offset: 4px</text></div>
				</div>
				<text class="faint">align-items: baseline</text>
				<div class="baseline"><text class="big">Big</text><text>small</text><text class="faint">smaller</text></div>
				<text class="faint">align-items: stretch</text>
				<div class="stretch">
					<div class="pill"><text>short</text></div>
					<div class="pill"><text>two</text><text>lines</text></div>
					<div class="pill"><text>short</text></div>
				</div>
				<text class="faint">justify-content: space-evenly</text>
				<div class="evenly">
					{#each [1, 2, 3, 4] as n (n)}
						<div class="dot"></div>
					{/each}
				</div>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">elements_at(x, y)</text>
				<text class="faint">The elements under the pointer, topmost first, like elementsFromPoint. The dashed layer is pointer-events: none, so it never shows.</text>
				<div class="stack" aria-label="stack" onmousemove={probe}>
					<div class="layer back" aria-label="back" onmousemove={probe}></div>
					<div class="layer middle" aria-label="middle" onmousemove={probe}></div>
					<div class="layer ghost" aria-label="ghost"></div>
				</div>
				<text class="mono">{stack.length > 0 ? stack.join(' › ') : 'move the pointer over the stack'}</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">BGRA pixels</text>
				<text class="faint">set_image_pixels(…, 'bgra') uploads in GPUI's own byte order, so there is no per-pixel swizzle</text>
				<img {@attach (n: ShadowNode) => void (plasma = n)} class="plasma" alt="Animated plasma" />
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">register_font(bytes)</text>
				<text class="faint">Load a .ttf, .otf or .ttc. Text that names its family picks it up on the next frame</text>
				<div class="row">
					<div class="btn primary" tabindex="0" role="button" onclick={load_font}><text>Load font…</text></div>
				</div>
				<text class="faint">{font_note}</text>
				<text class="sample" style:font-family={family ?? undefined}>The quick brown fox jumps over the lazy dog</text>
			</div>

			<div class="card">
				<text class="heading" role="heading" aria-level="2">&lt;anchored fill="window"&gt;</text>
				<text class="faint">A layer the size of the window that follows a resize in the same frame, painted over everything</text>
				<div class="row">
					<div class="btn primary" tabindex="0" role="button" onclick={() => (dialog = true)}><text>Open dialog</text></div>
				</div>
			</div>
		</div>
	</Scroller>

	{#if dialog}
		<anchored fill="window" class="backdrop" onclick={() => (dialog = false)}>
			<div class="dialog" role="dialog" aria-label="Example dialog">
				<text class="heading">A dialog</text>
				<text class="faint">Escape, the button or a click on the backdrop closes it. Tab walks on from here.</text>
				<div class="row">
					<div class="btn primary" tabindex="0" autofocus role="button" onclick={() => (dialog = false)}><text>Close</text></div>
				</div>
			</div>
		</anchored>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; width: 100%; height: 100%; background-color: var(--bg); color: var(--ink); font-size: 14px; }
	.title { font-size: 26px; font-weight: bold; }
	.heading { font-size: 16px; font-weight: 600; }
	.faint { color: var(--faint); font-size: 12px; }
	.mono { font-family: Menlo; font-size: 12px; color: var(--ok); }
	.grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px; }
	.card { display: flex; flex-direction: column; gap: 10px; flex-basis: 420px; flex-grow: 1; min-width: 0; padding: 16px; border-radius: 12px; background-color: var(--card); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; }
	.btn { padding: 6px 12px; border-radius: 8px; background-color: var(--raised); cursor: pointer; user-select: none; }
	.btn:hover { background-color: var(--hover); }
	.btn:focus-visible { outline-width: 2px; outline-color: var(--accent); outline-offset: 2px; }
	.primary { background-color: var(--accent); color: var(--bg); }
	.primary:hover { background-color: var(--ink); }
	.steady { keyboard-focus-dim: false; }
	.switch { position: relative; width: 44px; height: 24px; border-radius: 12px; background-color: var(--raised); cursor: pointer; }
	.switch:focus-visible { outline-width: 2px; outline-color: var(--accent); outline-offset: 2px; }
	.knob { position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 10px; background-color: var(--accent); }
	.field { padding: 8px; border-radius: 8px; background-color: var(--well); font-size: 13px; }
	.trap { padding: 6px 12px; border-radius: 8px; border-width: 1px; border-style: dashed; border-color: var(--hover); user-select: none; }
	.trap.on { border-color: var(--warn); color: var(--warn); }
	.trap:focus-visible { outline-width: 2px; outline-color: var(--warn); outline-offset: 2px; }
	.measured { padding: 8px; border-radius: 8px; background-color: var(--well); }
	.list { display: flex; flex-direction: column; height: 140px; overflow: scroll; border-radius: 8px; background-color: var(--well); scrollbar-color: var(--accent); scrollbar-width: 6px; }
	.item { padding: 4px 10px; color: var(--faint); }
	.ratio { display: flex; align-items: center; justify-content: center; width: 180px; aspect-ratio: 16 / 9; border-radius: 8px; background-color: var(--raised); font-size: 12px; }
	.dashed { padding: 12px; border-width: 2px; border-style: dashed; border-color: var(--faint); border-radius: 8px; font-size: 12px; }
	.outlined { padding: 12px; border-radius: 8px; background-color: var(--raised); outline-width: 2px; outline-color: var(--ok); outline-offset: 4px; font-size: 12px; }
	.baseline { display: flex; flex-direction: row; align-items: baseline; gap: 12px; }
	.big { font-size: 28px; }
	.stretch { display: flex; flex-direction: row; align-items: stretch; gap: 8px; }
	.pill { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 8px; background-color: var(--raised); }
	.evenly { display: flex; flex-direction: row; justify-content: space-evenly; padding: 8px; border-radius: 8px; background-color: var(--well); }
	.dot { width: 16px; height: 16px; border-radius: 8px; background-color: var(--accent); }
	.stack { position: relative; height: 140px; border-radius: 8px; background-color: var(--well); }
	.layer { position: absolute; border-radius: 8px; }
	.back { left: 16px; top: 16px; width: 180px; height: 100px; background-color: var(--raised); }
	.middle { left: 110px; top: 40px; width: 180px; height: 80px; background-color: var(--accent); opacity: 0.8; }
	.ghost { left: 220px; top: 24px; width: 160px; height: 90px; border-width: 2px; border-style: dashed; border-color: var(--ok); pointer-events: none; }
	.plasma { width: 320px; height: 160px; border-radius: 8px; }
	.sample { font-size: 22px; }
	.backdrop { display: flex; align-items: center; justify-content: center; background-color: #00000099; }
	.dialog { display: flex; flex-direction: column; gap: 12px; width: 360px; padding: 20px; border-radius: 12px; background-color: var(--card); }
</style>
