<script lang="ts">
	// Rules under @media and media_query(), against a window the test resizes by faking getWindowSize.
	import { media_query } from 'gpuix-svelte';

	const wide = media_query('(min-width: 600px)');
	const tall = media_query('(min-height: 10000px)');
	const dark = media_query('(prefers-color-scheme: dark)');
	let dependent = $state(true);
</script>

<div class="grid" testId="grid">grid</div>
<div class="plain" testId="plain">plain</div>
<div class="nested" testId="nested">nested</div>
<div class="tinted" testId="tinted">tinted</div>
<div class={dependent ? 'dependent' : 'independent'} testId="switch" onclick={() => (dependent = !dependent)}>switch</div>
<div testId="query">{wide.current ? 'wide' : 'narrow'}/{tall.current}/{dark.current}</div>
<div class="row" testId="row">
	<svg class="icon" testId="icon" source="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1'/></svg>"></svg>
</div>

<style>
	.grid {
		flex-direction: row;
		gap: 16px;
	}
	@media (max-width: 599px) {
		.grid {
			flex-direction: column;
			gap: 8px;
		}
	}
	@media (min-width: 600px) {
		.grid {
			padding: 20px;
		}
	}
	@media (max-width: 599px) {
		@media (orientation: landscape) {
			.nested {
				opacity: 0.5;
			}
		}
	}
	.row {
		color: blue;
	}
	@media (max-width: 599px) {
		.tinted {
			color: var(--narrow-ink);
		}
		.row {
			color: red;
		}
		.dependent {
			opacity: 0.25;
		}
	}
	.plain,
	.dependent,
	.independent {
		color: gray;
	}
	@media (prefers-color-scheme: dark) {
		.grid {
			color: pink;
		}
	}
	@media screen and (min-width: 50vw) {
		.grid {
			color: pink;
		}
	}
	@supports (display: flex) {
		.grid {
			color: pink;
		}
	}
	.icon {
		width: 10px;
		height: 10px;
	}
</style>
