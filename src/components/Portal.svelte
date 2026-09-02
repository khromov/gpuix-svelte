<script>
	// Paint order is document order, so an overlay had to be the root's last child.
	// `portal` hangs this wrapper off the root natively instead, wherever it is
	// rendered from; `pointer-events: none` keeps the wrapper itself out of hit testing
	// while its children stay clickable.
	let { children } = $props();
</script>

<div portal class="portal">{@render children()}</div>

<style>
	.portal { position: absolute; inset: 0; pointer-events: none; }
</style>
