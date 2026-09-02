<script>
	import { open_url } from '../lib/shell.js';
	import { md_theme } from '../lib/theme.svelte.js';

	let { source = '' } = $props();
</script>

<markdown {source} theme={md_theme()} onlinkclick={(e) => open_url(e.value)}></markdown>
