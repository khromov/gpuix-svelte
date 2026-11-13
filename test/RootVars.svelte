<script lang="ts">
	// Mounted on GPUI by test:root-vars and in the DOM by test:dom, which expect the same of it.
	// Its child is evaluated first, so this file's `:root` rules come later in the cascade and win.
	import RootVarsChild from './RootVarsChild.svelte';
</script>

<div class="card" testId="card">card</div>
<div class="derived" testId="derived">derived</div>
<div class="locked" testId="locked">locked</div>
<div class="gap" testId="gap">gap</div>
<div class="scoped" testId="scoped">scoped</div>
<div class="lazy" testId="lazy">lazy</div>
<div class="listed" testId="listed">listed</div>
<div class="plain" testId="plain">plain</div>
<RootVarsChild />

<style>
	:root {
		--surface: #101010;
		--pad: 4px 8px;
		--order: #aaaaaa;
		--accent: #ff3e00;
		--accent-ink: var(--accent);
		--from-js: var(--js, #abcabc);
		--locked: #0000aa !important;
		--gap: 16px;
		color: red;
	}
	:global(:root) {
		--global: #0a0a0a;
	}
	:root,
	.listed {
		--listed: 3px;
	}
	:root.dark {
		--surface: #ffffff;
	}
	@media (max-width: 599px) {
		:root {
			--gap: 4px;
		}
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--surface: #eeeeee;
		}
	}
	.card {
		background-color: var(--surface);
		padding: var(--pad);
		border-color: var(--order);
		outline-color: var(--child-only);
	}
	.derived {
		color: var(--accent-ink);
		background-color: var(--from-js);
		border-color: var(--global);
	}
	.locked {
		color: var(--locked);
	}
	.gap {
		gap: var(--gap);
	}
	.scoped {
		--local: 2px;
		margin: var(--local, 7px);
		opacity: 0.5;
	}
	.lazy {
		color: var(--lazy, #777777);
	}
	.listed {
		border-width: var(--listed);
	}
	.plain {
		color: gray;
	}
</style>
