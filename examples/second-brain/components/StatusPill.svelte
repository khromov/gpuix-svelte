<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';
	import { data } from '../lib/data.svelte.ts';
	import { status_actions } from '../lib/menus.ts';
	import { push } from '../lib/router.svelte.ts';
	import { is_secondary, open_menu } from '../lib/ui.svelte.ts';
	import Spinner from './Spinner.svelte';


	const summary = $derived.by(() => {
		const ml = data.ml;
		const states = (['embed', 'whisper', 'clip'] as const).map((m) => ml[m]?.state ?? 'unloaded');
		if (ml.worker === 'down' && ml.error) return { tone: 'error', text: 'models off', busy: false };
		if (ml.worker === 'restarting') return { tone: 'warn', text: 'worker restarting', busy: true };
		const downloading = (['embed', 'whisper', 'clip'] as const).filter((m) => ml[m]?.state === 'downloading');
		if (downloading.length) {
			const pct = Math.round(ml[downloading[0]].progress ?? 0);
			return { tone: 'warn', text: `downloading ${downloading[0]} ${pct}%`, busy: true };
		}
		if (states.includes('loading') || ml.worker === 'starting') return { tone: 'warn', text: 'loading models', busy: true };
		if (states.some((s) => s === 'error')) return { tone: 'error', text: 'model error', busy: false };
		const ready = states.filter((s) => s === 'ready').length;
		if (ready === 3) return { tone: 'ok', text: 'models ready', busy: false };
		if (ready > 0) return { tone: 'ok', text: `${ready}/3 models ready`, busy: false };
		if (data.queue.active > 0) return { tone: 'warn', text: 'working…', busy: true };
		return { tone: 'muted', text: ml.worker === 'up' ? 'models idle' : 'models offline', busy: false };
	});

	const show = (e: GpuixEvent) => open_menu(e, status_actions(), summary.text);
</script>

<div class="pill" hitbox="self" onclick={(e: GpuixEvent) => (is_secondary(e) ? show(e) : push('/settings'))} onauxclick={show}>
	{#if summary.busy}
		<Spinner size={11} />
	{:else}
		<div class="dot {summary.tone}"></div>
	{/if}
	<div class="text">{summary.text}</div>
	{#if data.queue.pending + data.queue.active > 0}
		<div class="count">{data.queue.pending + data.queue.active}</div>
	{/if}
</div>

<style>
	.pill { display: flex; flex-direction: row; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; border-width: 1px; font-size: 11px; line-height: 14px; cursor: pointer; user-select: none; border-color: var(--border); color: var(--inkMuted); }
	.pill:hover { background-color: var(--hover); }
	.text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dot { width: 8px; height: 8px; border-radius: 4px; }
	.dot.ok { background-color: var(--accent); }
	.dot.warn { background-color: var(--ochre); }
	.dot.error { background-color: var(--danger); }
	.dot.muted { background-color: var(--borderStrong); }
	.count { padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 14px; font-weight: 600; background-color: var(--well); color: var(--ink); }
</style>
