<script lang="ts">
	import { rtl_line, rtl_lines, rtl_words, type GpuixEvent } from 'gpuix-svelte';

	let {
		text,
		style = null
	}: {
		/** Right-to-left text, broken into lines at its spaces to fit the width the component is given. */
		text: string;
		/** Inline CSS for the paragraph, which wins over its own rules and reaches its lines: `font-size: 18px; color: #fff`. */
		style?: string | null;
	} = $props();

	// GPUI rounds every box to whole pixels, so a word is measured eight times over, its copies held apart by ZWNJs that keep their letters from joining.
	const COPIES = 8;

	const words = $derived(rtl_words(text));
	const unique = $derived([...new Set(words)]);
	const sizes: Record<string, number> = $state({});
	let whole = $state(0);
	let width = $state(0);

	// A box is reported only once it is painted, so the lines appear a frame after the words are measured.
	const lines = $derived(
		width > 0 && whole > 0 && unique.every((word) => word in sizes)
			? rtl_lines(
					words,
					words.map((word) => sizes[word]),
					whole,
					width
				)
			: []
	);
</script>

<div class="rtl" {style}>
	<div class="lines" onlayout={(e: GpuixEvent) => (width = e.width ?? 0)}>
		{#each lines as line, at (at)}
			<text class="line">{line}</text>
		{/each}
	</div>
	<div class="measure">
		<text class="word" role="none" onlayout={(e: GpuixEvent) => (whole = e.width ?? 0)}>{rtl_line(words)}</text>
		{#each unique as word (word)}
			<text class="word" role="none" onlayout={(e: GpuixEvent) => (sizes[word] = (e.width ?? 0) / COPIES)}>{rtl_line([Array(COPIES).fill(word).join('\u200C')])}</text>
		{/each}
	</div>
</div>

<style>
	.rtl {
		display: flex;
		flex-direction: column;
		position: relative;
		width: 100%;
	}
	.lines {
		display: flex;
		flex-direction: column;
		align-items: end;
		width: 100%;
	}
	.line {
		white-space: nowrap;
	}
	.measure {
		display: flex;
		flex-direction: column;
		align-items: start;
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
	}
	.word {
		white-space: nowrap;
	}
</style>
