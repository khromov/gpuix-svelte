<!-- Imports nothing from gpuix-svelte: only the compiled renderer import, as a component in a consumer's test. -->
<div class="box" testId="box">box</div>

<style>
	.box {
		color: gray;
	}
	@media (min-width: 801px) {
		.box {
			padding: 20px;
		}
	}
</style>
