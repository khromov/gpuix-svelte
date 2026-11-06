<script lang="ts">
	import type { Snippet } from 'svelte';

	// The browser scrolls and draws the thumb; what is left of the GPUI column is its shape, `follow` and the colours.
	let {
		children,
		gap = 8,
		pad = '0',
		grow = 1,
		scroll = true,
		follow = false,
		virtual = false,
		testid = null
	}: {
		children: Snippet;
		gap?: number;
		pad?: string;
		grow?: number;
		scroll?: boolean;
		follow?: boolean;
		/** No virtual list here: every row is laid out, under the GPUI list's spacing rules. */
		virtual?: boolean;
		/** Accepted for the GPUI list's sake; nothing to estimate here. */
		estimate?: number;
		testid?: string | null;
	} = $props();

	let column: HTMLElement | null = null;

	// `follow` keeps the bottom in view while the content grows, as in a streaming reply.
	function watch(content: HTMLElement) {
		if (typeof ResizeObserver === 'undefined') return;
		let last = 0;
		const observer = new ResizeObserver(() => {
			const height = content.offsetHeight;
			if (follow && column && height > last) column.scrollTop = column.scrollHeight;
			last = height;
		});
		observer.observe(content);
		return () => observer.disconnect();
	}
</script>

<div class="wrap" style="flex-grow: {grow}; padding: {virtual ? pad : '0'}">
	<div class="column" class:fixed={!scroll && !virtual} data-testid={testid} {@attach (node: HTMLElement) => (column = node)}>
		<div class="content" class:fixed={!scroll && !virtual} style="gap: {virtual ? 0 : gap}px; padding: {virtual ? '0' : pad}" {@attach watch}>
			{@render children()}
		</div>
	</div>
</div>

<style>
	.wrap { position: relative; display: flex; flex-direction: column; flex-basis: 0; min-height: 0; min-width: 0; width: 100%; height: 100%; }
	.column { display: flex; flex-direction: column; height: 100%; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--scroller-thumb, #404040) transparent; }
	.column:hover { scrollbar-color: var(--scroller-thumb-hover, #5a5a5a) transparent; }
	.column.fixed { overflow-y: hidden; }
	.content { display: flex; flex-direction: column; }
	.content.fixed { flex-grow: 1; min-height: 0; }
</style>
