<script lang="ts">
	import { onDestroy } from 'svelte';
	import { IS_GPUIX, media_query, on_window_key, set_css_vars, window_size } from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';

	// One component for two renderers. Nothing below asks which one it is on, apart from the badge:
	// `render_hot` opens it in a GPUI window (demo:cross) and Vite serves it as a page (demo:dom).
	const DARK = {
		bg: '#000000',
		panel: '#111111',
		raised: '#1c1c1c',
		'raised-hover': '#262626',
		border: '#242424',
		'border-strong': '#404040',
		ink: '#ededed',
		muted: '#a1a1a1',
		accent: '#ff3e00',
		'accent-ink': '#ff8a5c',
		'accent-wash': '#ff3e0029',
		'tooltip-surface': '#ededed',
		'tooltip-ink': '#000000',
		'popover-surface': '#1c1c1c',
		'popover-border': '#404040',
		'popover-ink': '#ededed',
		'scroller-thumb': '#404040',
		'scroller-thumb-hover': '#5a5a5a'
	};
	const LIGHT = {
		bg: '#fafafa',
		panel: '#ffffff',
		raised: '#f0f0f0',
		'raised-hover': '#e4e4e4',
		border: '#e5e5e5',
		'border-strong': '#bdbdbd',
		ink: '#171717',
		muted: '#6b6b6b',
		accent: '#ff3e00',
		'accent-ink': '#c93400',
		'accent-wash': '#ff3e001f',
		'tooltip-surface': '#171717',
		'tooltip-ink': '#ffffff',
		'popover-surface': '#ffffff',
		'popover-border': '#d4d4d4',
		'popover-ink': '#171717',
		'scroller-thumb': '#c9c9c9',
		'scroller-thumb-hover': '#a8a8a8'
	};

	let dark = $state(true);
	let menu = $state(false);
	let dialog = $state(false);
	let picked = $state('nothing yet');
	let rows = $state(Array.from({ length: 60 }, (_, i) => `Row ${i + 1}`));
	// The same breakpoint as the @media rule below: matchMedia in a browser, the window's size on GPUI.
	const narrow = media_query('(max-width: 600px)');

	$effect(() => set_css_vars(dark ? DARK : LIGHT));

	onDestroy(
		on_window_key('keydown', (e) => {
			if (e.editing) return;
			if (e.key === 't') dark = !dark;
			if (e.key === 'escape') dialog = false;
		})
	);

	function choose(item: string) {
		picked = item;
		menu = false;
	}
</script>

<div class="app" testid="app">
	<div class="bar">
		<div class="title">Cross-target</div>
		<div class="badge" testid="target">{IS_GPUIX ? 'GPUI' : 'DOM'}</div>
		<div class="size" testid="size">{window_size.width} × {window_size.height}</div>
		<div class="size" testid="layout">{narrow.current ? 'narrow' : 'wide'}</div>
		<div class="spacer"></div>
		<Tooltip content="Toggle the theme (T)">
			{#snippet children(hover)}
				<div class="btn" {...hover} onclick={() => (dark = !dark)} testid="theme">{dark ? 'Light' : 'Dark'}</div>
			{/snippet}
		</Tooltip>
		<Popover open={menu} onclose={() => (menu = false)} testid="menu">
			<div class="btn" onclick={() => (menu = !menu)} testid="menu-trigger">Menu</div>
			{#snippet content()}
				{#each ['Rename', 'Duplicate', 'Delete'] as item (item)}
					<div class="item" onclick={() => choose(item)} testid="item-{item.toLowerCase()}">{item}</div>
				{/each}
			{/snippet}
		</Popover>
		<div class="btn primary" onclick={() => (dialog = true)} testid="open">Dialog</div>
	</div>

	<div class="muted" testid="picked">Picked: {picked}. Click a row to remove it.</div>

	<Scroller testid="list" gap={4} pad="0 12px 0 0">
		{#each rows as row, i (row)}
			<div class="row" onclick={() => (rows = rows.filter((r) => r !== row))}>
				<div>{row}</div>
				<div class="muted">#{i + 1}</div>
			</div>
		{/each}
	</Scroller>

	{#if dialog}
		<Portal>
			<div class="scrim" onclick={() => (dialog = false)}>
				<div class="dialog" onclick={(e) => e.stopPropagation()} testid="dialog">
					<div class="title">A dialog in a Portal</div>
					<div class="muted">Escape, the button or a click outside closes it.</div>
					<div class="btn primary" onclick={() => (dialog = false)} testid="close">Close</div>
				</div>
			</div>
		</Portal>
		<div class="muted" testid="dialog-open">A dialog is open; it paints on top from inside a Portal.</div>
	{/if}
</div>

<style>
	.app { display: flex; flex-direction: column; gap: 12px; width: 100%; height: 100%; padding: 16px; font-size: 14px; background-color: var(--bg); color: var(--ink); }
	@media (max-width: 600px) {
		.app { padding: 8px; gap: 8px; }
	}
	.bar { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px; }
	.title { font-size: 16px; font-weight: 600; }
	.badge { padding: 2px 8px; border-radius: 999px; border-width: 1px; border-style: solid; border-color: var(--accent-wash); font-size: 12px; font-weight: 500; line-height: 16px; background-color: var(--accent-wash); color: var(--accent-ink); }
	.size { padding: 0 8px; border-radius: 999px; border-width: 1px; border-style: solid; border-color: var(--border); font-size: 12px; line-height: 20px; color: var(--muted); }
	.muted { color: var(--muted); font-size: 13px; }
	.spacer { flex-grow: 1; }
	.btn { display: flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 8px; border-width: 1px; border-style: solid; border-color: var(--border); font-weight: 500; cursor: pointer; user-select: none; color: var(--ink); }
	.btn:hover { border-color: var(--border-strong); background-color: var(--raised); }
	.btn.primary { border-color: var(--ink); background-color: var(--ink); color: var(--bg); }
	.btn.primary:hover { border-color: var(--ink); background-color: var(--ink); opacity: 0.88; }
	.item { padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
	.item:hover { background-color: var(--raised-hover); }
	.row { display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; border-width: 1px; border-style: solid; border-color: var(--border); cursor: pointer; background-color: var(--panel); }
	.row:hover { border-color: var(--border-strong); background-color: var(--raised); }
	.scrim { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background-color: #00000099; }
	.dialog { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; max-width: 380px; padding: 20px; border-radius: 12px; border-width: 1px; border-style: solid; border-color: var(--border-strong); background-color: var(--panel); color: var(--ink); }
</style>
