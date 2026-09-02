<script>
	import { add_link_from_text, capture, paste_image, pick_audio, pick_images, start_recording, stop_recording, submit } from '../lib/capture.svelte.js';
	import { data, format_duration } from '../lib/data.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';
	import { register } from '../lib/ui.svelte.js';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	const mode = $derived(resolved());
	const caps = $derived(data.capabilities);
	const recording = $derived(capture.recording);
	let focused = $state(false);
</script>

<div class="box {mode}" class:focused>
	<textarea
		{@attach (node) => register('capture', node)}
		value={capture.text}
		minRows={2}
		maxRows={8}
		placeholder="Pour something in — a thought, a link, anything. Enter saves, Shift+Enter for a new line."
		class="text {mode}"
		onchange={(e) => (capture.text = e.value)}
		onsubmit={() => submit()}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		testId="capture-input"
	></textarea>

	{#if recording}
		<div class="rec {mode}">
			<div class="dot {mode}"></div>
			<div class="rec-label">Recording {format_duration(recording.elapsed)}</div>
			<div class="meter {mode}"><div class="level {mode}" style="width: {Math.round(recording.level * 100)}%"></div></div>
			<Button label="Stop" icon="stop" variant="danger" small onclick={stop_recording} testid="stop-recording" />
		</div>
	{/if}

	<div class="actions">
		<Button label="Save" icon="plus" variant="primary" small onclick={submit} disabled={!capture.text.trim()} testid="capture-save" />
		<Button label="Add link" icon="link" small onclick={add_link_from_text} disabled={!capture.text.trim()} />
		<div class="sep {mode}"></div>
		<Button label="Add image…" icon="image" small onclick={pick_images} disabled={caps ? !caps.filePicker.ok : false} />
		<Button label="Paste image" icon="paste" small onclick={paste_image} disabled={caps ? !caps.clipboardImage.ok : false} />
		<div class="sep {mode}"></div>
		{#if !recording}
			<Button label={capture.busy ? 'Asking for the mic…' : 'Record'} icon="mic" small onclick={start_recording} disabled={capture.busy || (caps ? !caps.recorder.ok : false)} testid="record" />
		{/if}
		<Button label="Import audio…" icon="audio" small onclick={pick_audio} disabled={caps ? !caps.filePicker.ok : false} />
		<div class="grow"></div>
		{#if caps && !caps.recorder.ok}
			<div class="note {mode}"><Icon name="alert" size={12} tone="faint" /><div class="note-text">{caps.recorder.reason}</div></div>
		{/if}
	</div>
</div>

<style>
	.box { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; border-width: 1px; }
	.box.light { background-color: #fbf7ef; border-color: #e2d8c4; }
	.box.focused.light { border-color: #5f7a4a; background-color: #ffffff; }
	.box.dark { background-color: #231f1b; border-color: #36302a; }
	.box.focused.dark { border-color: #8fae74; }
	.text { font-size: 14px; line-height: 21px; padding: 4px 2px; }
	.text.light { color: #2a251f; }
	.text.dark { color: #ece3d3; }
	.actions { display: flex; flex-direction: row; align-items: center; gap: 6px; flex-wrap: wrap; user-select: none; }
	.sep { width: 1px; height: 18px; margin: 0 4px; }
	.sep.light { background-color: #e2d8c4; }
	.sep.dark { background-color: #36302a; }
	.grow { flex-grow: 1; }
	.note { display: flex; flex-direction: row; align-items: center; gap: 5px; font-size: 11px; line-height: 14px; pointer-events: none; }
	.note.light { color: #9b9080; }
	.note.dark { color: #7b7163; }
	.note-text { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rec { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; user-select: none; }
	.rec.light { background-color: #f3dcd6; color: #a9483a; }
	.rec.dark { background-color: #3c2521; color: #d46f5e; }
	.dot { width: 10px; height: 10px; border-radius: 5px; pointer-events: none; }
	.dot.light { background-color: #a9483a; }
	.dot.dark { background-color: #d46f5e; }
	.rec-label { font-size: 12px; line-height: 16px; font-weight: 600; font-family: Lilex; pointer-events: none; }
	.meter { position: relative; flex-grow: 1; height: 6px; border-radius: 3px; overflow: hidden; pointer-events: none; }
	.meter.light { background-color: rgba(169, 72, 58, 0.2); }
	.meter.dark { background-color: rgba(212, 111, 94, 0.2); }
	.level { position: absolute; top: 0; left: 0; height: 6px; border-radius: 3px; }
	.level.light { background-color: #a9483a; }
	.level.dark { background-color: #d46f5e; }
</style>
