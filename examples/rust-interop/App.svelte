<script lang="ts">
	import { onDestroy } from 'svelte';
	import { set_css_vars } from 'gpuix-svelte';
	import { TRANSPORTS, type Transport, type TransportKind } from './transports/index.ts';

	interface Status {
		kind: TransportKind;
		state: 'connecting' | 'ready' | 'failed';
		error: string;
		pushes: number;
		last_push: string;
		replies: number;
		last_ms: number | null;
	}

	interface Entry {
		id: number;
		transport: string;
		dir: 'sent' | 'reply' | 'event';
		text: string;
		ms?: number;
	}

	const QUICK = ['greet gpuix', 'add 2 3.5', 'upper hello from svelte', 'fib 50', 'frobnicate'];

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
		event: '#cba6f7'
	});

	let statuses = $state<Status[]>(
		TRANSPORTS.map((kind) => ({ kind, state: 'connecting', error: '', pushes: 0, last_push: '', replies: 0, last_ms: null }))
	);
	let log = $state<Entry[]>([]);
	let draft = $state('greet gpuix');
	let log_events = $state(false);
	let next_id = 0;

	// Transports hold native handles and closures, so they stay out of $state.
	const live: Record<string, Transport> = {};

	for (const status of statuses) connect(status);

	async function connect(status: Status) {
		try {
			const transport = await status.kind.create();
			live[status.kind.id] = transport;
			transport.subscribe((event) => {
				status.pushes++;
				status.last_push = event;
				if (log_events) push(status.kind.id, 'event', event);
			});
			status.state = 'ready';
		} catch (err) {
			status.state = 'failed';
			status.error = (err as Error).message;
		}
	}

	onDestroy(() => {
		for (const transport of Object.values(live)) transport.close();
	});

	function push(transport: string, dir: Entry['dir'], text: string, ms?: number) {
		log.unshift({ id: next_id++, transport, dir, text, ms });
		if (log.length > 80) log.length = 80;
	}

	function send_all(text = draft) {
		text = text.trim();
		if (!text) return;
		draft = text;
		for (const status of statuses) {
			const transport = live[status.kind.id];
			if (transport) void send_one(status, transport, text);
		}
	}

	async function send_one(status: Status, transport: Transport, text: string) {
		push(status.kind.id, 'sent', text);
		const started = performance.now();
		const result = transport.send(text);
		// Timed before any await: the continuation would only run after this frame's commit.
		const call_ms = performance.now() - started;
		const reply = typeof result === 'string' ? result : await result;
		const ms = typeof result === 'string' ? call_ms : performance.now() - started;
		status.replies++;
		status.last_ms = ms;
		push(status.kind.id, 'reply', reply, ms);
	}

	const fmt_ms = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(2)} ms`);
</script>

<div class="app">
	<div class="title">Svelte ↔ Rust, four ways</div>
	<div class="subtitle">Each card is the same Rust crate reached a different way. Every message goes to all four and the replies land in the log; the counters are what Rust sends without being asked.</div>

	<div class="cards">
		{#each statuses as s (s.kind.id)}
			<div class="card" testid="card-{s.kind.id}">
				<div class="card-head">
					<div class="name">{s.kind.name}</div>
					<div class="pill" class:ready={s.state === 'ready'} class:failed={s.state === 'failed'}>
						{s.state}
					</div>
				</div>
				<div class="detail">{s.kind.mechanism}</div>
				<div class="detail">Rust → JS: {s.kind.push}</div>
				{#if s.state === 'failed'}
					<div class="error" testid="error-{s.kind.id}">{s.error}</div>
				{:else}
					<div class="stats">
						<div class="stat">
							<div class="stat-label">pushed</div>
							<div class="stat-value event-color" testid="pushes-{s.kind.id}">{s.pushes}</div>
							<div class="stat-sub">{s.last_push || '—'}</div>
						</div>
						<div class="stat">
							<div class="stat-label">replies</div>
							<div class="stat-value">{s.replies}</div>
							<div class="stat-sub">{s.last_ms === null ? '—' : fmt_ms(s.last_ms)}</div>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="compose">
		<input
			class="field"
			value={draft}
			placeholder="greet <name> · add <a> <b> … · upper <text> · fib <n>"
			onchange={(e) => (draft = e.value)}
			onsubmit={() => send_all()}
		/>
		<div class="button" testid="send" onclick={() => send_all()}>Send to Rust</div>
	</div>

	<div class="chips">
		{#each QUICK as cmd (cmd)}
			<div class="chip" onclick={() => send_all(cmd)}>{cmd}</div>
		{/each}
		<div class="chip toggle" class:on={log_events} onclick={() => (log_events = !log_events)}>
			events in log: {log_events ? 'on' : 'off'}
		</div>
	</div>

	<div class="log" testid="log">
		{#if log.length === 0}
			<div class="empty">Nothing sent yet.</div>
		{/if}
		{#each log as entry (entry.id)}
			<div class="row">
				<div class="tag">{entry.transport}</div>
				<div class="dir" class:reply={entry.dir === 'reply'} class:event-color={entry.dir === 'event'}>
					{entry.dir === 'sent' ? '→' : entry.dir === 'reply' ? '←' : '⚡'}
				</div>
				<div class="msg">{entry.text}</div>
				{#if entry.ms !== undefined}
					<div class="ms">{fmt_ms(entry.ms)}</div>
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
		font-size: 22px;
		font-weight: bold;
	}
	.subtitle {
		color: var(--dim);
	}
	.cards {
		display: flex;
		flex-direction: row;
		gap: 12px;
		width: 100%;
	}
	.card {
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
	.card-head {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
	}
	.name {
		font-size: 15px;
		font-weight: bold;
	}
	.pill {
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		background-color: var(--raised);
		color: var(--warn);
	}
	.pill.ready {
		color: var(--ok);
	}
	.pill.failed {
		color: var(--bad);
	}
	.detail {
		color: var(--muted);
		font-size: 12px;
	}
	.error {
		color: var(--bad);
		font-size: 12px;
	}
	.stats {
		display: flex;
		flex-direction: row;
		gap: 12px;
		margin-top: 6px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		width: 50%;
		padding: 8px;
		background-color: var(--raised);
		border-radius: 8px;
	}
	.stat-label {
		font-size: 11px;
		color: var(--muted);
	}
	.stat-value {
		font-size: 20px;
		font-weight: bold;
	}
	.stat-sub {
		font-size: 11px;
		color: var(--dim);
	}
	.event-color {
		color: var(--event);
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
	.button:hover {
		background-color: #b4befe;
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
	.chip.on {
		color: var(--event);
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		height: 260px;
		padding: 10px;
		overflow-y: scroll;
		background-color: var(--panel);
		border-radius: 10px;
	}
	.empty {
		color: var(--muted);
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 10px;
		align-items: center;
		font-size: 12px;
	}
	.tag {
		width: 44px;
		color: var(--muted);
	}
	.dir {
		width: 14px;
		color: var(--dim);
	}
	.dir.reply {
		color: var(--ok);
	}
	.msg {
		color: var(--text);
	}
	.ms {
		color: var(--muted);
		font-size: 11px;
	}
</style>
