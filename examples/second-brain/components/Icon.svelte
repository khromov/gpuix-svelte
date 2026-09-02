<script lang="ts">
	import { ICONS, type IconName } from '../lib/icons.ts';

	// GPUI tints an <svg> with its own `color` and inherits nothing, so the colour is
	// picked here by tone rather than left to the parent.
	let { name, size = 16, tone = 'muted' }: { name: IconName; size?: number; tone?: string } = $props();

</script>

<svg source={ICONS[name] ?? ICONS.dot} class="icon {tone}" style="width: {size}px; height: {size}px"></svg>

<style>
	.icon.ink { color: var(--ink); }
	.icon.muted { color: var(--inkMuted); }
	.icon.faint { color: var(--inkFaint); }
	.icon.accent { color: var(--accent); }
	.icon.accentDeep { color: var(--accentDeep); }
	.icon.onAccent { color: var(--accentInk); }
	.icon.danger { color: var(--danger); }
	.icon.onDanger { color: var(--dangerInk); }
	.icon.text { color: var(--ochre); }
	.icon.link { color: var(--info); }
	.icon.image { color: var(--plum); }
	.icon.audio { color: var(--teal); }
</style>
