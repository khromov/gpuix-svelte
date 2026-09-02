<script>

	let { kind } = $props();

	const LABEL = { text: 'note', link: 'link', image: 'image', audio: 'audio' };
</script>

<div class="badge {kind}">{LABEL[kind] ?? kind}</div>

<style>
	.badge { padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 16px; font-weight: 600; user-select: none; }
	.badge.text { background-color: var(--ochreSoft); color: var(--ochreInk); }
	.badge.link { background-color: var(--infoSoft); color: var(--info); }
	.badge.image { background-color: var(--plumSoft); color: var(--plum); }
	.badge.audio { background-color: var(--tealSoft); color: var(--teal); }
</style>
