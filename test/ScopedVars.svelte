<script lang="ts">
	// Mounted on GPUI by test:scoped-vars and in the DOM by test:dom, which expect the same of it.
	import ScopedCard from './ScopedCard.svelte';

	let themed = $state(true);
	let alt = $state(false);
	let inline = $state<string | null>('#0000bb');

	export const set_themed = (on: boolean) => (themed = on);
	export const set_alt = (on: boolean) => (alt = on);
	export const set_inline = (value: string | null) => (inline = value);
</script>

<div class="page">
	<ScopedCard id="outside" />
	<div class="orphan" testId="orphan"></div>
	<div class:themed class:alt testId="themed">
		<ScopedCard id="by-class" />
		<div class="reader" testId="reader">
			<svg class="icon" testId="icon" source="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1'/></svg>"></svg>
		</div>
		<div class="free" testId="free"></div>
		<div class="static" testId="static"></div>
		<div style:--tint={inline} testId="inline">
			<ScopedCard id="by-inline" />
		</div>
	</div>
	<div class="self" style="--own: #5e1f00" testId="self"></div>
	<div class="outer">
		<div class="inner">
			<div class="computed" testId="computed"></div>
		</div>
	</div>
	<div class="pinned" testId="pinned"></div>
	<div class="narrow">
		<div class="gap" testId="gap"></div>
	</div>
</div>

<style>
	:root {
		--tint: #00aa00;
		--pinned: #0000aa !important;
	}
	.page {
		display: flex;
		flex-direction: column;
	}
	.themed {
		--tint: #aa0000;
	}
	.themed.alt {
		--tint: #aa00aa;
	}
	.reader {
		color: var(--tint);
		border-color: var(--none, var(--tint));
	}
	.reader:hover {
		--tint: #ffffff;
		opacity: 0.5;
	}
	.icon {
		width: 8px;
		height: 8px;
	}
	.free {
		color: var(--free, #777777);
	}
	.static {
		color: #010101;
	}
	.orphan {
		color: var(--own);
	}
	.self {
		--own: #000003;
		--own-pad: 6px;
		color: var(--own);
		padding: var(--own-pad);
	}
	.outer {
		--base: #111111;
		--derived: var(--base);
	}
	.inner {
		--base: #222222;
	}
	.computed {
		color: var(--derived);
		background-color: var(--base);
	}
	.pinned {
		--pinned: #aa5500 !important;
		color: var(--pinned);
	}
	.narrow {
		--space: 16px;
	}
	@media (max-width: 599px) {
		.narrow {
			--space: 4px;
		}
	}
	.gap {
		gap: var(--space);
	}
</style>
