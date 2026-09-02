<script>
	import { readFileSync } from 'node:fs';
	import { spawn } from 'node:child_process';
	import { focus_element } from 'gpuix-svelte';
	import { CHAPTERS, STEPS as RAW_STEPS } from './steps.js';
	import { THEME } from './theme.js';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import CodePanel from './CodePanel.svelte';
	import Diagram from './Diagram.svelte';
	import Quiz from './Quiz.svelte';
	import Hello from './samples/Hello.svelte';
	import Counter from './samples/Counter.svelte';
	import Styled from './samples/Styled.svelte';
	import Scroll from './samples/Scroll.svelte';
	import List from './samples/List.svelte';
	import HitTest from './samples/HitTest.svelte';
	import Native from './samples/Native.svelte';
	import Motion from './samples/Motion.svelte';

	const LIVE = { hello: Hello, counter: Counter, styled: Styled, scroll: Scroll, list: List, hittest: HitTest, native: Native, motion: Motion };

	// Read here rather than in steps.js: a hot reload re-evaluates this module but
	// not plain JS, so a saved sample shows its new source.
	const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
	const STEPS = RAW_STEPS.map((step) => ({
		...step,
		prose: read(step.prose),
		code: step.code.map((c) => (c.file ? { ...c, source: read(c.file).trimEnd() } : c))
	}));

	// The slot outlives a remount (render.js keeps the window the same way), so the
	// edit-and-save exercise stays on its step. GPUIX_TUTORIAL_STEP=7 seeds it once:
	// steps.js and content/ do not hot-reload, so restarts are common while writing them.
	const persisted = (globalThis[Symbol.for('gpuix.svelte.tutorial')] ??= {
		index: Number(process.env.GPUIX_TUTORIAL_STEP) - 1 || 0,
		answers: {}
	});

	let index = $state(Math.max(0, Math.min(persisted.index, STEPS.length - 1)));
	let answers = $state(persisted.answers);

	$effect(() => {
		persisted.index = index;
		persisted.answers = $state.snapshot(answers);
	});

	const step = $derived(STEPS[index]);
	const Live = $derived(LIVE[step.live] ?? null);
	const answered = $derived(Object.keys(answers).length);
	const correct = $derived(STEPS.filter((s) => answers[s.id] === s.quiz.answer).length);

	const CHAPTER_COLORS = ['#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7'];
	const BUTTON = 'padding: 8px 16px; border-radius: 6px; background-color: #313244; color: #cdd6f4; font-size: 13px';

	let root = null;

	function go(to) {
		index = Math.max(0, Math.min(STEPS.length - 1, to));
		// The <input> on the native-elements step takes focus on mousedown and nothing gives it back.
		focus_element(root);
	}

	function onkey(e) {
		if (e.key === 'left' || e.key === 'ArrowLeft') go(index - 1);
		else if (e.key === 'right' || e.key === 'ArrowRight') go(index + 1);
	}

	function dot_color(s, i) {
		if (i === index) return '#89b4fa';
		if (answers[s.id] === undefined) return '#45475a';
		return answers[s.id] === s.quiz.answer ? '#a6e3a1' : '#f38ba8';
	}

	function open(url) {
		const cmd =
			process.platform === 'darwin' ? ['open', url]
			: process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
			: ['xdg-open', url];
		const child = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true });
		child.on('error', (err) => console.error('[tutorial] could not open browser:', err.message));
		child.unref();
	}
</script>

<div
	{@attach (node) => (root = node)}
	autofocus
	tabindex="0"
	onkeydown={onkey}
	style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #11111b"
>
	<div
		style="display: flex; flex-direction: row; align-items: center; gap: 16px; padding: 12px 16px;
		       background-color: #1e1e2e; user-select: none"
	>
		<div style="color: #cdd6f4; font-size: 15px; font-weight: bold">gpuix-svelte tutorial</div>
		<div style="font-size: 12px; font-weight: bold" style:color={CHAPTER_COLORS[step.chapter]}>
			{CHAPTERS[step.chapter]}
		</div>

		<div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-grow: 1">
			{#each STEPS as s, i (s.id)}
				<div
					style="width: 10px; height: 10px; border-radius: 5px; cursor: pointer"
					style:background-color={dot_color(s, i)}
					hover="opacity: 0.7"
					onclick={() => go(i)}
				></div>
			{/each}
		</div>

		<div style="color: #6c7086; font-size: 12px">step {index + 1} of {STEPS.length}</div>
	</div>

	<div style="display: flex; flex-direction: row; flex-grow: 1; min-height: 0; gap: 12px; padding: 12px">
		{#key step.id}
			<Scroller gap={12} testid="left-panel">
				<div style="color: #cdd6f4; font-size: 22px; font-weight: bold">{step.title}</div>
				<markdown source={step.prose} theme={THEME} onlinkclick={(e) => open(e.value)}></markdown>
				{#if step.diagram}
					<Diagram spec={step.diagram} />
				{/if}
				<Quiz {...step.quiz} picked={answers[step.id] ?? null} onpick={(i) => (answers[step.id] = i)} />
			</Scroller>

			<Scroller scroll={!step.previewFill} grow={1.25} gap={12} testid="right-panel">
				{#each step.code as c (c.label)}
					<CodePanel {...c} theme={THEME} />
				{/each}

				{#if Live}
					<div
						style="display: flex; flex-direction: column; gap: 10px; padding: 12px; border-width: 1px;
						       border-color: #313244; border-radius: 8px; background-color: #1e1e2e
						       {step.previewFill ? '; flex-grow: 1; min-height: 200px' : ''}"
					>
						<div style="font-size: 11px; font-weight: bold; color: #a6e3a1">
							LIVE — the component above, running natively
						</div>
						<Live />
					</div>
				{/if}
			</Scroller>
		{/key}
	</div>

	<div
		style="display: flex; flex-direction: row; align-items: center; justify-content: space-between;
		       padding: 10px 16px; background-color: #1e1e2e; user-select: none"
	>
		<div
			style={BUTTON}
			style:cursor={index > 0 ? 'pointer' : 'default'}
			style:opacity={index > 0 ? 1 : 0.4}
			hover={index > 0 ? 'background-color: #45475a' : null}
			onclick={() => go(index - 1)}
		>
			← Previous
		</div>

		<div style="color: #6c7086; font-size: 12px">
			{answered ? `quiz: ${correct} of ${answered} correct` : '← → keys also navigate'}
		</div>

		<div
			style={BUTTON}
			style:cursor={index < STEPS.length - 1 ? 'pointer' : 'default'}
			style:opacity={index < STEPS.length - 1 ? 1 : 0.4}
			hover={index < STEPS.length - 1 ? 'background-color: #45475a' : null}
			onclick={() => go(index + 1)}
		>
			Next →
		</div>
	</div>
</div>
