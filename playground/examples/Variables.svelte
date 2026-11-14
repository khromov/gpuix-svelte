<script>
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';

	const ACCENTS = ['#ff3e00', '#3b82f6', '#22c55e', '#eab308'];
	const rows = Array.from({ length: 40 }, (_, i) => `Row ${i + 1}`);

	let accent = $state(ACCENTS[1]);
	let inverted = $state(true);
</script>

<div class="app">
	<div class="cards">
		<div class="card">
			<div class="label">:root</div>
			<div>Declared once in a :root rule, these reach every element in the app.</div>
			<div class="chip">accent</div>
		</div>

		<div class="card" class:inverted>
			<div class="label">A class rule</div>
			<div>The .inverted rule declares its own colours for this card and what is inside it.</div>
			<div class="chip">accent</div>
			<div class="btn" onclick={() => (inverted = !inverted)}>{inverted ? 'Take the class off' : 'Put the class on'}</div>
		</div>

		<div class="card" style:--accent={accent}>
			<div class="label">An inline style</div>
			<div>This card's style attribute declares the accent you pick, and the list beside it takes the same one.</div>
			<div class="chip">accent</div>
			<div class="swatches">
				{#each ACCENTS as colour (colour)}
					<div class="swatch" class:picked={colour === accent} style:--accent={colour} onclick={() => (accent = colour)}></div>
				{/each}
			</div>
		</div>
	</div>

	<div class="side">
		<div class="label">A style prop</div>
		<div>The Scroller below is given --scroller-thumb, which only its own thumb reads.</div>
		<div class="list">
			<Scroller --scroller-thumb={accent} --scroller-thumb-hover={accent}>
				{#each rows as row (row)}
					<div class="line">{row}</div>
				{/each}
			</Scroller>
		</div>
	</div>
</div>

<style>
	:root {
		--bg: #000000;
		--card: #111111;
		--edge: #242424;
		--text: #ededed;
		--muted: #a1a1a1;
		--accent: #ff3e00;
		--on-accent: #000000;
	}
	.inverted {
		--card: #ededed;
		--edge: #ededed;
		--text: #111111;
		--muted: #525252;
		--accent: #7c3aed;
		--on-accent: #ffffff;
	}
	.app {
		display: flex;
		flex-direction: row;
		gap: 16px;
		width: 100%;
		height: 100%;
		padding: 20px;
		background-color: var(--bg);
		color: var(--text);
		font-size: 13px;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 60%;
		flex-shrink: 0;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 14px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--edge);
		border-radius: 10px;
		background-color: var(--card);
		color: var(--text);
	}
	.label {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	.chip {
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		background-color: var(--accent);
		color: var(--on-accent);
	}
	.btn {
		padding: 5px 10px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--muted);
		border-radius: 6px;
		cursor: pointer;
		user-select: none;
	}
	.swatches {
		display: flex;
		flex-direction: row;
		gap: 8px;
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-width: 2px;
		border-style: solid;
		border-color: var(--card);
		border-radius: 11px;
		cursor: pointer;
		background-color: var(--accent);
	}
	.swatch.picked {
		border-color: var(--text);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		height: 240px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--edge);
		border-radius: 10px;
		background-color: var(--card);
	}
	.line {
		width: 100%;
		padding: 6px 14px;
	}
</style>
