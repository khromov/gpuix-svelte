<script lang="ts">
	import { get_native, on_window_key, type GpuixEvent } from 'gpuix-svelte';
	import { route } from '../lib/router.svelte.ts';
	import { close_menu, ui, type MenuAction } from '../lib/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';

	const WIDTH = 240;
	const MARGIN = 8;
	const ROW = 28;
	const SEPARATOR = 9;
	const TITLE = 20;
	const FRAME = 14;

	let confirming = $state<{ action: MenuAction } | null>(null);

	const rows = $derived.by(() => {
		let n = -1;
		return (ui.menu?.entries ?? []).map((entry) => (entry === 'separator' ? { separator: true as const } : { separator: false as const, action: entry, n: ++n }));
	});
	const actions = $derived(rows.flatMap((row) => (row.separator ? [] : [row.action])));

	// Sized from the row count against the metrics the style block below uses, rather than
	// measured, so the flip lands in the frame the menu first appears in.
	const placed = $derived.by(() => {
		const open = ui.menu;
		if (!open) return null;
		const size = get_native()?.getWindowSize();
		const window_width = size?.width ?? 1180;
		const window_height = size?.height ?? 780;
		const height = FRAME + (open.title ? TITLE : 0) + rows.reduce((sum, row) => sum + (row.separator ? SEPARATOR : ROW), 0);
		const left = open.x + WIDTH > window_width - MARGIN ? Math.max(MARGIN, open.x - WIDTH) : open.x;
		const top = open.y + height > window_height - MARGIN ? Math.max(MARGIN, open.y - height) : open.y;
		return { left, top };
	});

	function choose(action: MenuAction) {
		if (action.disabled) return;
		close_menu();
		if (action.confirm) confirming = { action };
		else action.run();
	}

	function confirmed(ok: boolean) {
		const pending = confirming;
		confirming = null;
		if (ok) pending?.action.run();
	}

	function step(by: number) {
		const open = ui.menu;
		if (!open || !actions.length) return;
		let at = open.active < 0 ? (by > 0 ? -1 : 0) : open.active;
		for (let i = 0; i < actions.length; i++) {
			at = (at + by + actions.length) % actions.length;
			if (!actions[at].disabled) break;
		}
		open.active = at;
	}

	function onkey(e: GpuixEvent) {
		const open = ui.menu;
		if (!open) return;
		if (e.key === 'escape') return close_menu();
		if (e.key === 'down') return step(1);
		if (e.key === 'up') return step(-1);
		if (e.key === 'enter' && open.active >= 0) choose(actions[open.active]);
	}

	$effect(() => on_window_key('keydown', onkey));
	// A shortcut can navigate out from under an open menu.
	$effect(() => {
		void route.path;
		close_menu();
	});
</script>

{#if ui.menu && placed}
	<div class="backdrop" onclick={close_menu} onauxclick={close_menu} testId="menu-backdrop">
		<div class="menu" style="left: {placed.left}px; top: {placed.top}px" onclick={() => {}} onauxclick={() => {}} testId="menu">
			{#if ui.menu.title}<div class="head">{ui.menu.title}</div>{/if}
			{#each rows as row, i (i)}
				{#if row.separator}
					<div class="rule"></div>
				{:else}
					<div
						class="row"
						class:danger={row.action.danger}
						class:disabled={row.action.disabled}
						class:active={row.n === ui.menu.active}
						hitbox="self"
						onclick={() => choose(row.action)}
						testId="menu-{row.action.label}"
					>
						{#if row.action.icon}<Icon name={row.action.icon} size={13} tone={row.action.danger ? 'danger' : 'faint'} />{/if}
						<div class="label">{row.action.label}</div>
						{#if row.action.hint}<div class="hint">{row.action.hint}</div>{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}

{#if confirming}
	<Modal
		title={confirming.action.confirm!.title}
		body={confirming.action.confirm!.body ?? null}
		confirmLabel={confirming.action.confirm!.confirmLabel}
		danger={confirming.action.danger ?? false}
		onclose={confirmed}
	/>
{/if}

<style>
	.backdrop { position: absolute; inset: 0; }
	.menu { position: absolute; display: flex; flex-direction: column; width: 240px; padding: 6px; border-radius: 10px; border-width: 1px; user-select: none; background-color: var(--raised); border-color: var(--borderStrong); }
	.head { padding: 3px 8px; font-size: 10px; line-height: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--inkFaint); }
	.rule { height: 1px; margin: 4px 6px; background-color: var(--divider); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 6px; cursor: pointer; color: var(--ink); }
	.row:hover { background-color: var(--hoverStrong); }
	.row.active { background-color: var(--accentSoft); }
	.row.danger { color: var(--danger); }
	.row.disabled { opacity: 0.4; cursor: default; }
	.label { flex-grow: 1; font-size: 13px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hint { font-size: 11px; line-height: 16px; color: var(--inkFaint); }
</style>
