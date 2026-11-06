<script lang="ts">
	import type { THEME } from './theme.ts';

	let { label, language, source, theme }: { label: string; language: string; source: string; theme: typeof THEME } = $props();
</script>

<div style="display: flex; flex-direction: column; gap: 6px">
	<div style="font-family: Menlo; font-size: 11px; color: #a1a1a1">{label}</div>
	<code
		code={source}
		{language}
		showLineNumbers
		{theme}
		style="padding: 10px; background-color: #111111; border-width: 1px; border-color: #242424; border-radius: 10px; width: 100%"
	></code>
</div>
