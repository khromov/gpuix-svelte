<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import { host, send } from './ipc.svelte.ts';

	set_css_vars({
		bg: '#11111b',
		panel: '#1e1e2e',
		raised: '#313244',
		line: '#45475a',
		text: '#cdd6f4',
		dim: '#a6adc8',
		muted: '#6c7086',
		accent: '#89b4fa',
		ok: '#a6e3a1',
		warn: '#f9e2af',
		bad: '#f38ba8',
		rust: '#fab387'
	});

	let draft = $state('');

	function add() {
		send({ type: 'add_item', text: draft });
		draft = '';
	}

	const bar = (reading: number) => Math.round(((reading - 14) / 12) * 100);
</script>

<div class="app">
	<div class="head">
		<div class="title">Rust app, Svelte view</div>
		<div class="status" class:on={host.connected}>{host.connected ? 'model from Rust' : 'waiting for Rust…'}</div>
	</div>
	<div class="subtitle">
		Nothing here is state: every number is the Rust process's model, and every click is a command sent back to it.
	</div>

	<div class="row">
		<div class="panel">
			<div class="label">counter</div>
			<div class="big">{host.model.counter}</div>
			<div class="buttons">
				<div class="button" onclick={() => send({ type: 'decrement' })}>−</div>
				<div class="button" onclick={() => send({ type: 'increment' })}>+</div>
				<div class="button quiet" onclick={() => send({ type: 'reset' })}>reset</div>
			</div>
		</div>

		<div class="panel">
			<div class="label">reading, computed by Rust twice a second</div>
			<div class="big rust">{host.model.reading.toFixed(2)} °C</div>
			<div class="track">
				<div class="fill" style:width="{bar(host.model.reading)}%"></div>
			</div>
			<div class="meta">uptime {host.model.uptime_s}s · {host.received} messages in · {host.sent} commands out</div>
		</div>
	</div>

	<div class="panel">
		<div class="label">items (a Vec&lt;String&gt; in Rust)</div>
		{#each host.model.items as item, index (index + item)}
			<div class="item" onclick={() => send({ type: 'remove_item', index })}>
				<div>{item}</div>
				<div class="muted">click to remove</div>
			</div>
		{/each}
		{#if host.model.items.length === 0}
			<div class="muted">empty</div>
		{/if}
		<div class="compose">
			<input class="field" value={draft} placeholder="new item" onchange={(e) => (draft = e.value)} onsubmit={add} />
			<div class="button" onclick={add}>add</div>
		</div>
	</div>

	{#if host.toast}
		<div class="toast">{host.toast}</div>
	{/if}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 14px;
		width: 100%;
		height: 100%;
		padding: 22px;
		background-color: var(--bg);
		color: var(--text);
		font-size: 13px;
	}
	.head {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
	}
	.title {
		font-size: 22px;
		font-weight: bold;
	}
	.status {
		padding: 3px 10px;
		border-radius: 999px;
		background-color: var(--raised);
		color: var(--warn);
		font-size: 11px;
	}
	.status.on {
		color: var(--ok);
	}
	.subtitle {
		color: var(--dim);
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 12px;
		width: 100%;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		padding: 14px;
		background-color: var(--panel);
		border-radius: 10px;
	}
	.label {
		font-size: 11px;
		color: var(--muted);
	}
	.big {
		font-size: 36px;
		font-weight: bold;
	}
	.big.rust {
		color: var(--rust);
	}
	.buttons {
		display: flex;
		flex-direction: row;
		gap: 8px;
	}
	.button {
		padding: 8px 16px;
		border-radius: 8px;
		background-color: var(--accent);
		color: var(--bg);
		font-weight: bold;
		cursor: pointer;
	}
	.button:hover {
		background-color: #b4befe;
	}
	.button.quiet {
		background-color: var(--raised);
		color: var(--dim);
	}
	.track {
		width: 100%;
		height: 10px;
		border-radius: 5px;
		background-color: var(--raised);
	}
	.fill {
		height: 10px;
		border-radius: 5px;
		background-color: var(--rust);
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.item {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		padding: 8px 10px;
		border-radius: 6px;
		background-color: var(--raised);
		cursor: pointer;
	}
	.item:hover {
		background-color: var(--line);
	}
	.muted {
		color: var(--muted);
		font-size: 12px;
	}
	.compose {
		display: flex;
		flex-direction: row;
		gap: 8px;
		align-items: center;
		width: 100%;
	}
	.field {
		flex-grow: 1;
		flex-basis: 0;
		padding: 8px 12px;
		border-radius: 8px;
		background-color: var(--bg);
		color: var(--text);
		border-width: 1px;
		border-color: var(--line);
	}
	.toast {
		padding: 8px 12px;
		border-radius: 8px;
		background-color: var(--raised);
		color: var(--warn);
	}
</style>
