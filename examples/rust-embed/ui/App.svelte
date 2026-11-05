<script lang="ts">
	import { onDestroy } from 'svelte';
	import { set_css_vars } from 'gpuix-svelte';
	import { rust } from './rust.ts';

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
		rust: '#fab387'
	});

	interface Entry {
		id: number;
		dir: 'sent' | 'reply' | 'event';
		text: string;
		us?: number;
	}

	const QUICK = ['greet gpuix', 'add 2 3.5', 'upper embedded', 'fib 50', 'frobnicate'];

	let draft = $state('greet gpuix');
	let log = $state<Entry[]>([]);
	let pushes = $state(0);
	let last_push = $state('');
	let next_id = 0;

	function push(dir: Entry['dir'], text: string, us?: number) {
		log.unshift({ id: next_id++, dir, text, us });
		if (log.length > 60) log.length = 60;
	}

	function send(text = draft) {
		text = text.trim();
		if (!text) return;
		draft = text;
		push('sent', text);
		const started = performance.now();
		const reply = rust.functions.rust_handle(text);
		push('reply', reply, (performance.now() - started) * 1000);
		console.error(`[view] ${text} → ${reply}`);
	}

	send('greet embedded view');

	// Rust → JS: the embedding runs JS only from the event loop, so JS asks for what queued.
	const timer = setInterval(() => {
		for (const event of rust.functions.rust_poll()) {
			pushes++;
			last_push = event;
			console.error(`[view] Rust pushed: ${event}`);
		}
	}, 100);
	onDestroy(() => clearInterval(timer));
</script>

<div class="app">
	<div class="title">One binary: Rust main(), embedded Deno, gpuix-svelte view</div>
	<div class="subtitle">Every call below is a Rust closure the host registered: no addon, no FFI, no child process. The counter is what a Rust thread pushed.</div>

	<div class="row">
		<div class="panel">
			<div class="label">pushed by a Rust thread</div>
			<div class="big rust">{pushes}</div>
			<div class="meta">{last_push || '—'}</div>
		</div>
		<div class="panel">
			<div class="label">replies</div>
			<div class="big">{log.filter((e) => e.dir === 'reply').length}</div>
			<div class="meta">{log.find((e) => e.dir === 'reply')?.text ?? '—'}</div>
		</div>
	</div>

	<div class="compose">
		<input
			class="field"
			value={draft}
			placeholder="greet <name> · add <a> <b> … · upper <text> · fib <n>"
			onchange={(e) => (draft = e.value)}
			onsubmit={() => send()}
		/>
		<div class="button" onclick={() => send()}>Call Rust</div>
	</div>

	<div class="chips">
		{#each QUICK as cmd (cmd)}
			<div class="chip" onclick={() => send(cmd)}>{cmd}</div>
		{/each}
	</div>

	<div class="log">
		{#each log as entry (entry.id)}
			<div class="entry">
				<div class="dir" class:reply={entry.dir === 'reply'}>{entry.dir === 'sent' ? '→' : '←'}</div>
				<div>{entry.text}</div>
				{#if entry.us !== undefined}
					<div class="meta">{entry.us.toFixed(0)} µs</div>
				{/if}
			</div>
		{/each}
	</div>
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
	.title {
		font-size: 20px;
		font-weight: bold;
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
		gap: 6px;
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
		font-size: 32px;
		font-weight: bold;
	}
	.big.rust {
		color: var(--rust);
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.compose {
		display: flex;
		flex-direction: row;
		gap: 10px;
		align-items: center;
		width: 100%;
	}
	.field {
		flex-grow: 1;
		flex-basis: 0;
		padding: 10px 12px;
		border-radius: 8px;
		background-color: var(--panel);
		color: var(--text);
		border-width: 1px;
		border-color: var(--line);
	}
	.button {
		padding: 10px 18px;
		border-radius: 8px;
		background-color: var(--accent);
		color: var(--bg);
		font-weight: bold;
		cursor: pointer;
	}
	.chips {
		display: flex;
		flex-direction: row;
		gap: 8px;
	}
	.chip {
		padding: 5px 10px;
		border-radius: 6px;
		background-color: var(--raised);
		color: var(--dim);
		font-size: 12px;
		cursor: pointer;
	}
	.chip:hover {
		background-color: var(--line);
		color: var(--text);
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		height: 220px;
		padding: 10px;
		overflow-y: scroll;
		background-color: var(--panel);
		border-radius: 10px;
	}
	.entry {
		display: flex;
		flex-direction: row;
		gap: 10px;
		align-items: center;
		font-size: 12px;
	}
	.dir {
		width: 14px;
		color: var(--dim);
	}
	.dir.reply {
		color: var(--ok);
	}
</style>
