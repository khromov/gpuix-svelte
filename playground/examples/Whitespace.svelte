<!-- Put <svelte:options preserveWhitespace /> on the next line, and on GPUI the first card is drawn as it is written. -->

<script>
	const lines = 'A string from an expression\nkeeps its line breaks,\nbecause they are data.';
</script>

<div class="app">
	<div class="card">
		<div class="label">Written in the markup</div>
		<div>
			This sentence is wrapped over
			three indented lines in the source,
			and is drawn as one, with    single    spaces.
		</div>
	</div>
	<div class="card">
		<div class="label">From an expression</div>
		<div class="data">{lines}</div>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		height: 100%;
		padding: 24px;
		background-color: #000000;
		color: #ededed;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px;
		border-width: 1px;
		border-style: solid;
		border-color: #242424;
		border-radius: 10px;
		background-color: #111111;
	}
	.label {
		color: #a1a1a1;
		font-size: 12px;
	}
	.data {
		white-space: pre-line;
	}
</style>
