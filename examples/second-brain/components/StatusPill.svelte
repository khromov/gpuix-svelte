<script>
	import { data } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';
	import Spinner from './Spinner.svelte';

	const mode = $derived(resolved());

	const summary = $derived.by(() => {
		const ml = data.ml;
		const states = ['embed', 'whisper', 'clip'].map((m) => ml[m]?.state ?? 'unloaded');
		if (ml.worker === 'down' && ml.error) return { tone: 'error', text: 'models off', busy: false };
		if (ml.worker === 'restarting') return { tone: 'warn', text: 'worker restarting', busy: true };
		const downloading = ['embed', 'whisper', 'clip'].filter((m) => ml[m]?.state === 'downloading');
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
</script>

<div class="pill {mode}" onclick={() => push('/settings')}>
	{#if summary.busy}
		<Spinner size={11} />
	{:else}
		<div class="dot {summary.tone} {mode}"></div>
	{/if}
	<div class="text">{summary.text}</div>
	{#if data.queue.pending + data.queue.active > 0}
		<div class="count {mode}">{data.queue.pending + data.queue.active}</div>
	{/if}
</div>

<style>
	.pill { display: flex; flex-direction: row; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; border-width: 1px; font-size: 11px; line-height: 14px; cursor: pointer; user-select: none; }
	.pill.light { border-color: #e2d8c4; color: #6b6154; }
	.pill.light:hover { background-color: rgba(42, 37, 31, 0.05); }
	.pill.dark { border-color: #36302a; color: #b2a791; }
	.pill.dark:hover { background-color: rgba(236, 227, 211, 0.06); }
	.text { pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dot { width: 8px; height: 8px; border-radius: 4px; pointer-events: none; }
	.dot.ok.light { background-color: #5f7a4a; }
	.dot.ok.dark { background-color: #8fae74; }
	.dot.warn.light { background-color: #b8822b; }
	.dot.warn.dark { background-color: #d9a34a; }
	.dot.error.light { background-color: #a9483a; }
	.dot.error.dark { background-color: #d46f5e; }
	.dot.muted.light { background-color: #cbbfa6; }
	.dot.muted.dark { background-color: #4a4237; }
	.count { padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 14px; font-weight: 600; pointer-events: none; }
	.count.light { background-color: #ece4d4; color: #2a251f; }
	.count.dark { background-color: #36302a; color: #ece3d3; }
</style>
