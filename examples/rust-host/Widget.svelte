<script lang="ts">
	import { host } from 'gpuix-svelte/embed';
	import { set_css_vars } from 'gpuix-svelte';

	// What the host handed over, and re-sends with `set_props`.
	let { user = '', theme = 'dark', pings = 0 }: { user?: string; theme?: string; pings?: number } = $props();

	let count = $state(0);
	let uptime = $state<number | null>(null);
	let reply = $state('');
	let note = $state('');

	$effect(() =>
		set_css_vars(
			theme === 'dark'
				? { bg: '#1e1e2e', panel: '#313244', text: '#cdd6f4', muted: '#a6adc8', accent: '#89b2fa' }
				: { bg: '#eff1f5', panel: '#dce0e8', text: '#4c4f69', muted: '#6c6f85', accent: '#1e66f5' }
		)
	);

	// The host emits `tick` once a second from its own clock.
	$effect(() => host.on('tick', (data) => (uptime = (data as { uptime: number }).uptime)));

	async function notify() {
		try {
			const answer = (await host.call('notify', note || `count is ${count}`)) as { uptime: number };
			reply = `host answered at ${answer.uptime}s`;
		} catch (error) {
			reply = `host refused: ${(error as Error).message}`;
		}
	}
</script>

<div class="widget">
	<text class="title">Widget.svelte, mounted by a Rust app</text>
	<text class="muted">
		props from Rust: user={user} theme={theme} pings={pings}
	</text>
	<text class="muted">host clock: {uptime === null ? 'waiting for the first tick' : `${uptime}s`}</text>

	<div class="row">
		<div class="button" onclick={() => count--}><text>−</text></div>
		<text class="count">{count}</text>
		<div class="button" onclick={() => count++}><text>+</text></div>
	</div>

	<div class="row">
		<input class="field" value={note} onchange={(e) => (note = e.value)} placeholder="a note for the host" />
		<div class="button accent" onclick={notify}><text>host.call('notify')</text></div>
	</div>
	{#if reply}
		<text class="muted">{reply}</text>
	{/if}
</div>

<style>
	.widget {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px;
		width: 100%;
		height: 100%;
		background-color: var(--bg);
		color: var(--text);
	}
	.title {
		font-size: 18px;
		font-weight: 600;
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
	}
	.row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
	}
	.count {
		font-size: 24px;
		min-width: 40px;
		text-align: center;
	}
	.button {
		padding: 6px 14px;
		border-radius: 6px;
		background-color: var(--panel);
		cursor: pointer;
	}
	.button:hover {
		background-color: var(--accent);
		color: var(--bg);
	}
	.accent {
		background-color: var(--accent);
		color: var(--bg);
	}
	.field {
		width: 260px;
		padding: 6px 10px;
		border-radius: 6px;
		background-color: var(--panel);
		color: var(--text);
	}
</style>
