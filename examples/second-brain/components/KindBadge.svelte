<script>
	import { resolved } from '../lib/theme.svelte.js';

	let { kind } = $props();

	const LABEL = { text: 'note', link: 'link', image: 'image', audio: 'audio' };
	const mode = $derived(resolved());
</script>

<div class="badge {kind} {mode}">{LABEL[kind] ?? kind}</div>

<style>
	.badge { padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 16px; font-weight: 600; pointer-events: none; user-select: none; }
	.badge.text.light { background-color: #f1e3c6; color: #9a6a1f; }
	.badge.text.dark { background-color: #3a2e1b; color: #d9a34a; }
	.badge.link.light { background-color: #dce6ef; color: #4f6b8a; }
	.badge.link.dark { background-color: #26313d; color: #87a4c3; }
	.badge.image.light { background-color: #ede0ec; color: #7a5878; }
	.badge.image.dark { background-color: #352a36; color: #b48ab0; }
	.badge.audio.light { background-color: #d9ebe9; color: #3f7a75; }
	.badge.audio.dark { background-color: #1f3634; color: #6fb3ad; }
</style>
