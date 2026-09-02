<script lang="ts">
	import Button from '../components/Button.svelte';
	import Field from '../components/Field.svelte';
	import ProgressBar from '../components/ProgressBar.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Segmented from '../components/Segmented.svelte';
	import Spinner from '../components/Spinner.svelte';
	import { data, display_title, format_bytes, get_app, item_by_id, status_text } from '../lib/data.svelte.ts';
	import { create_llm } from '../lib/llm.ts';
	import { MODEL_IDS, type ModelName } from '../lib/ml-client.ts';
	import type { SettingKey } from '../lib/settings.ts';
	import { reveal } from '../lib/shell.ts';
	import { set_mode, theme } from '../lib/theme.svelte.ts';
	import { toast } from '../lib/ui.svelte.ts';
	import Modal from '../components/Modal.svelte';

	const app = get_app();
	const settings = app.settings;

	let llm = $state({
		baseUrl: settings.get('llm.baseUrl') ?? '',
		apiKey: settings.get('llm.apiKey') ?? '',
		model: settings.get('llm.model') ?? '',
		visionModel: settings.get('llm.visionModel') ?? ''
	});
	let language = $state(settings.get('stt.language') ?? '');
	let testing = $state(false);

	const save = (key: SettingKey, prop: keyof typeof llm, value: string) => {
		llm[prop] = value;
		settings.set(key, value.trim());
	};

	async function test_connection() {
		const config = settings.llm_config();
		if (!config) return toast('Fill in a base URL and a model first', 'error');
		testing = true;
		try {
			const result = await create_llm(config).test();
			toast(
				result.modelListed
					? `Connected — ${result.models.length} models, "${config.model}" is available`
					: `Connected (${result.models.length} models listed, "${config.model}" not among them — it may still work)`,
				result.modelListed ? 'success' : 'info'
			);
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			testing = false;
		}
	}

	let confirming = $state(false);

	function rebuild(ok: boolean) {
		confirming = false;
		if (!ok) return;
		app.reindex();
		toast('Reindexing in the background');
	}

	const in_flight = $derived(data.queue.active_ids.map((id) => item_by_id(id)).filter(Boolean));
	const outstanding = $derived(data.queue.pending + data.queue.active);
	const session_total = $derived(outstanding + data.queue.done + data.queue.failed);
	const pipeline_pct = $derived(session_total > 0 ? ((data.queue.done + data.queue.failed) / session_total) * 100 : 100);

	function requeue() {
		const n = app.requeue();
		toast(n ? `Requeued ${n} item${n === 1 ? '' : 's'}` : 'Nothing to requeue');
	}

	function retry_failed() {
		const n = app.retry_failed();
		toast(n ? `Retrying ${n} failed item${n === 1 ? '' : 's'}` : 'No failed items');
	}

	const MODELS: Array<{ key: ModelName; label: string; note: string }> = [
		{ key: 'embed', label: 'Text embeddings', note: 'semantic search, related items, Ask' },
		{ key: 'whisper', label: 'Speech to text', note: 'transcribes recordings' },
		{ key: 'clip', label: 'Image understanding', note: 'finds images by what is in them' }
	];
	const THEMES = [
		{ value: 'light', icon: 'sun', label: 'Light' },
		{ value: 'dark', icon: 'moon', label: 'Dark' },
		{ value: 'system', icon: 'monitor', label: 'System' }
	];
	const STATE_LABEL: Record<string, string> = { unloaded: 'not loaded', downloading: 'downloading', loading: 'loading', ready: 'ready', error: 'error' };
</script>

<div class="route">
	<Scroller pad="20px 24px 32px 24px" gap={20}>
		<div class="section">
			<div class="heading">Language model</div>
			<div class="hint">Any OpenAI-compatible endpoint. Ollama: http://localhost:11434 · LM Studio: http://localhost:1234 · OpenAI: https://api.openai.com/v1</div>
			<Field label="Base URL" value={llm.baseUrl} placeholder="http://localhost:11434" mono hint={settings.from_env('llm.baseUrl') ? 'set by GPUIX_BRAIN_LLM_URL' : ''} onchange={(v) => save('llm.baseUrl', 'baseUrl', v)} onsubmit={test_connection} />
			<Field label="API key" value={llm.apiKey} placeholder="optional for local servers" secret hint={settings.from_env('llm.apiKey') ? 'set by GPUIX_BRAIN_LLM_KEY' : 'stored in plain text inside the data directory'} onchange={(v) => save('llm.apiKey', 'apiKey', v)} />
			<div class="row">
				<Field label="Model" value={llm.model} placeholder="llama3.2, gpt-4o-mini, …" mono onchange={(v) => save('llm.model', 'model', v)} onsubmit={test_connection} />
				<Field label="Vision model (optional)" value={llm.visionModel} placeholder="llava, gpt-4o, … describes images on import" mono onchange={(v) => save('llm.visionModel', 'visionModel', v)} />
			</div>
			<div class="row">
				<Button label={testing ? 'Testing…' : 'Test connection'} icon="check" variant="primary" disabled={testing} onclick={test_connection} />
				{#if testing}<Spinner size={12} />{/if}
			</div>
		</div>

		<div class="section">
			<div class="heading">Appearance</div>
			<Segmented options={THEMES} value={theme.mode} onchange={set_mode} />
		</div>

		<div class="section">
			<div class="heading">On-device models</div>
			<div class="hint">Downloaded once into the data directory (about 400 MB), then run locally through transformers.js in a worker process.</div>
			{#if data.ml.error}
				<div class="problem">{data.ml.error}</div>
			{/if}
			{#each MODELS as m (m.key)}
				{@const status = data.ml[m.key] ?? { state: 'unloaded' }}
				<div class="model">
					<div class="model-text">
						<div class="model-name">{m.label}</div>
						<div class="model-note">{MODEL_IDS[m.key]} · {m.note}</div>
						{#if status.state === 'downloading'}
							<ProgressBar value={status.progress ?? null} />
						{/if}
						{#if status.state === 'error'}
							<div class="problem">{status.error}</div>
						{/if}
					</div>
					<div class="model-state {status.state}">
						{#if status.state === 'loading' || status.state === 'downloading'}<Spinner size={11} />{/if}
						<div>{STATE_LABEL[status.state] ?? status.state}{status.state === 'downloading' && status.progress != null ? ` ${Math.round(status.progress)}%` : ''}</div>
					</div>
					{#if status.state === 'unloaded' || status.state === 'error'}
						<Button label="Load" small disabled={!app.ml.available} onclick={() => app.ml.load(m.key).catch((err) => toast(err.message, 'error'))} />
					{/if}
				</div>
			{/each}
			<div class="row">
				<div class="hint">
					Worker: {data.ml.worker}{data.ml.memory ? ` · ${format_bytes(data.ml.memory.rss)}` : ''} · App: {format_bytes(data.memory)}. Whisper and image models unload after fifteen idle minutes and reload on demand.
				</div>
				<div class="grow"></div>
				<Button label="Restart worker" icon="refresh" small onclick={() => app.ml.restart?.().catch((err) => toast(err.message, 'error'))} />
			</div>
		</div>

		<div class="section">
			<div class="heading">Pipeline</div>
			<div class="hint">
				{#if outstanding > 0}
					{data.queue.active} in flight · {data.queue.pending} queued · {data.queue.done} done this session{data.queue.failed ? ` · ${data.queue.failed} failed` : ''}
				{:else if data.queue.done + data.queue.failed > 0}
					Idle — {data.queue.done} done this session{data.queue.failed ? `, ${data.queue.failed} failed` : ''}
				{:else}
					Idle
				{/if}
			</div>
			<ProgressBar value={outstanding > 0 ? pipeline_pct : 100} />
			{#each in_flight as item (item.id)}
				<div class="job">
					<Spinner size={11} />
					<div class="job-title">{display_title(item)}</div>
					<div class="job-step">{status_text(item)}</div>
				</div>
			{/each}
			{#if data.stuck > 0}
				<div class="problem">
					{data.stuck} unfinished item{data.stuck === 1 ? '' : 's'} nobody is working on — left by another process or a crash. They are picked up after ten minutes, or now:
				</div>
			{/if}
			<div class="row">
				<Button label={data.stuck > 0 ? `Requeue ${data.stuck} unfinished` : 'Requeue unfinished'} icon="refresh" small disabled={data.stuck === 0} onclick={requeue} />
				<Button label={data.counts.error > 0 ? `Retry ${data.counts.error} failed` : 'Retry failed'} icon="refresh" small disabled={data.counts.error === 0} onclick={retry_failed} />
			</div>
		</div>

		<div class="section">
			<div class="heading">Transcription</div>
			<Field label="Language" value={language} placeholder="auto-detect (or en, sv, de, …)" hint="Whisper base is multilingual; forcing a language helps short clips." onchange={(v) => { language = v; settings.set('stt.language', v.trim()); }} />
		</div>

		<div class="section">
			<div class="heading">Data</div>
			<div class="hint">{app.dirs.root}</div>
			<div class="hint">{data.counts.total} items · {app.vectors.size} text vectors · {app.images.size} image vectors</div>
			<div class="row">
				<Button label="Reveal in Finder" icon="folder" small onclick={() => reveal(app.dirs.db)} />
				<Button label="Rebuild index" icon="refresh" small onclick={() => (confirming = true)} />
				{#if confirming}
					<Modal title="Rebuild the index?" body="Every item is chunked and embedded again. Nothing is deleted." confirmLabel="Rebuild" onclose={rebuild} />
				{/if}
			</div>
		</div>
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.section { display: flex; flex-direction: column; gap: 12px; max-width: 720px; padding: 18px 20px; border-radius: 12px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.heading { font-size: 15px; line-height: 20px; font-weight: 600; }
	.hint { font-size: 12px; line-height: 17px; color: var(--inkMuted); }
	.row { display: flex; flex-direction: row; align-items: end; gap: 12px; }
	.grow { flex-grow: 1; }
	.problem { padding: 8px 10px; border-radius: 6px; font-size: 12px; line-height: 16px; background-color: var(--dangerSoft); color: var(--danger); }
	.model { display: flex; flex-direction: row; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 8px; border-width: 1px; border-color: var(--border); }
	.model-text { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; }
	.model-name { font-size: 13px; line-height: 18px; font-weight: 600; }
	.model-note { font-size: 11px; line-height: 15px; color: var(--inkFaint); }
	.model-state { display: flex; flex-direction: row; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; white-space: nowrap; user-select: none; }
	.model-state.ready { color: var(--accent); }
	.model-state.error { color: var(--danger); }
	.model-state.unloaded { color: var(--inkFaint); }
	.job { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 12px; line-height: 16px; background-color: var(--well); }
	.job-title { flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.job-step { white-space: nowrap; color: var(--inkMuted); }
</style>
