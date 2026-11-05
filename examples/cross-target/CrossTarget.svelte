<script lang="ts">
	import { is_gpuix, on_window_key, set_css_vars, window_size } from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';

	// One component for two renderers. Nothing below asks which one it is on, apart from the badge:
	// `render_hot` opens it in a GPUI window (demo:cross) and Vite serves it as a page (demo:dom).
	const DARK = {
		bg: '#1e1e2e',
		panel: '#313244',
		raised: '#45475a',
		ink: '#cdd6f4',
		muted: '#a6adc8',
		accent: '#89b4fa',
		'on-accent': '#1e1e2e',
		'tooltip-surface': '#45475a',
		'tooltip-ink': '#cdd6f4',
		'popover-surface': '#313244',
		'popover-border': '#45475a',
		'popover-ink': '#cdd6f4',
		'scroller-thumb': '#585b70',
		'scroller-thumb-hover': '#7f849c'
	};
	const LIGHT = {
		bg: '#eff1f5',
		panel: '#ffffff',
		raised: '#dce0e8',
		ink: '#4c4f69',
		muted: '#6c6f85',
		accent: '#1e66f5',
		'on-accent': '#ffffff',
		'tooltip-surface': '#4c4f69',
		'tooltip-ink': '#eff1f5',
		'popover-surface': '#ffffff',
		'popover-border': '#ccd0da',
		'popover-ink': '#4c4f69',
		'scroller-thumb': '#bcc0cc',
		'scroller-thumb-hover': '#9ca0b0'
	};

	let dark = $state(true);
	let menu = $state(false);
	let dialog = $state(false);
	let picked = $state('nothing yet');
	let rows = $state(Array.from({ length: 60 }, (_, i) => `Row ${i + 1}`));

	$effect(() => set_css_vars(dark ? DARK : LIGHT));

	$effect(() =>
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
		<div class="badge" testid="target">{is_gpuix() ? 'GPUI' : 'DOM'}</div>
		<div class="muted" testid="size">{window_size.width} × {window_size.height}</div>
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
	{/if}
</div>

<style>
	.app { display: flex; flex-direction: column; gap: 12px; width: 100%; height: 100%; padding: 16px; font-size: 14px; background-color: var(--bg); color: var(--ink); }
	.bar { display: flex; flex-direction: row; align-items: center; gap: 10px; }
	.title { font-size: 16px; font-weight: bold; }
	.badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold; background-color: var(--accent); color: var(--on-accent); }
	.muted { color: var(--muted); font-size: 13px; }
	.spacer { flex-grow: 1; }
	.btn { padding: 6px 14px; border-radius: 6px; cursor: pointer; user-select: none; background-color: var(--panel); }
	.btn:hover { background-color: var(--raised); }
	.btn.primary { background-color: var(--accent); color: var(--on-accent); }
	.item { padding: 6px 12px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
	.item:hover { background-color: var(--raised); }
	.row { display: flex; flex-direction: row; justify-content: space-between; padding: 8px 12px; border-radius: 6px; cursor: pointer; background-color: var(--panel); }
	.row:hover { background-color: var(--raised); }
	.scrim { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background-color: #00000088; }
	.dialog { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 20px; border-radius: 12px; background-color: var(--panel); color: var(--ink); }
</style>
