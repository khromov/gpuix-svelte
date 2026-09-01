<script>
	let { label, language, source, theme } = $props();
</script>

<div style="display: flex; flex-direction: column; gap: 6px">
	<div style="font-family: Menlo; font-size: 11px; color: #cba6f7">{label}</div>
	<code
		code={source}
		{language}
		showLineNumbers
		{theme}
		style="padding: 10px; background-color: #181825; border-radius: 6px; width: 100%"
	></code>
</div>
