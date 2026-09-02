<script>
	import { add_link_from_text, capture, paste_image, pick_audio, pick_images, start_recording, stop_recording, submit } from '../lib/capture.svelte.js';
	import { data, format_duration } from '../lib/data.svelte.js';
	import { register } from '../lib/ui.svelte.js';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	const caps = $derived(data.capabilities);
	const recording = $derived(capture.recording);
	let focused = $state(false);
</script>

<div class="box" class:focused>
	<textarea
		{@attach (node) => register('capture', node)}
		value={capture.text}
		minRows={2}
		maxRows={8}
		placeholder="Pour something in — a thought, a link, anything. Enter saves, Shift+Enter for a new line."
		class="text"
		onchange={(e) => (capture.text = e.value)}
		onsubmit={() => submit()}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		testId="capture-input"
	></textarea>

	{#if recording}
		<div class="rec">
			<div class="dot"></div>
			<div class="rec-label">Recording {format_duration(recording.elapsed)}</div>
			<div class="meter"><div class="level" style="width: {Math.round(recording.level * 100)}%"></div></div>
			<Button label="Stop" icon="stop" variant="danger" small onclick={stop_recording} testid="stop-recording" />
		</div>
	{/if}

	<div class="actions">
		<Button label="Save" icon="plus" variant="primary" small onclick={submit} disabled={!capture.text.trim()} testid="capture-save" />
		<Button label="Add link" icon="link" small onclick={add_link_from_text} disabled={!capture.text.trim()} />
		<div class="sep"></div>
		<Button label="Add image…" icon="image" small onclick={pick_images} disabled={caps ? !caps.filePicker.ok : false} />
		<Button label="Paste image" icon="paste" small onclick={paste_image} disabled={caps ? !caps.clipboardImage.ok : false} />
		<div class="sep"></div>
		{#if !recording}
			<Button label={capture.busy ? 'Asking for the mic…' : 'Record'} icon="mic" small onclick={start_recording} disabled={capture.busy || (caps ? !caps.recorder.ok : false)} testid="record" />
		{/if}
		<Button label="Import audio…" icon="audio" small onclick={pick_audio} disabled={caps ? !caps.filePicker.ok : false} />
		<div class="grow"></div>
		{#if caps && !caps.recorder.ok}
			<div class="note"><Icon name="alert" size={12} tone="faint" /><div class="note-text">{caps.recorder.reason}</div></div>
		{/if}
	</div>
</div>

<style>
	.box { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.box.focused { border-color: var(--accent); background-color: var(--focusSurface); }
	.text { font-size: 14px; line-height: 21px; padding: 4px 2px; color: var(--ink); }
	.actions { display: flex; flex-direction: row; align-items: center; gap: 6px; flex-wrap: wrap; user-select: none; }
	.sep { width: 1px; height: 18px; margin: 0 4px; background-color: var(--border); }
	.grow { flex-grow: 1; }
	.note { display: flex; flex-direction: row; align-items: center; gap: 5px; font-size: 11px; line-height: 14px; pointer-events: none; color: var(--inkFaint); }
	.note-text { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rec { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; user-select: none; background-color: var(--dangerSoft); color: var(--danger); }
	.dot { width: 10px; height: 10px; border-radius: 5px; pointer-events: none; background-color: var(--danger); }
	.rec-label { font-size: 12px; line-height: 16px; font-weight: 600; font-family: Lilex; pointer-events: none; }
	.meter { position: relative; flex-grow: 1; height: 6px; border-radius: 3px; overflow: hidden; pointer-events: none; background-color: var(--dangerWash); }
	.level { position: absolute; top: 0; left: 0; height: 6px; border-radius: 3px; background-color: var(--danger); }
</style>
