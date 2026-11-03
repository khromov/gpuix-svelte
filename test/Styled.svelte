<script lang="ts">
	// The selectors below cover what compile.ts accepts, plus the ones it must refuse.
	let on = $state(false);
	let kind = $state('a');
</script>

<div class="btn" class:on onclick={() => (on = !on)}>toggle</div>
<div class="btn" style="color: #000000">inline</div>
<div class="btn" hover="color: #ffffff">attr</div>
<div class="btn primary">compound</div>
<div class={kind} onclick={() => (kind = kind === 'a' ? 'b' : 'a')}>dynamic</div>
<div class="card"><div class="title">nested</div></div>
<div class="tagged">tagged</div>
<div class="btn" focus-visible="outline-color: #ffffff">focus</div>
<text class="tagged">other tag</text>
<div class="later earlier">same weight</div>
<div class="first">first</div>
<div class="second">second</div>
<div hover="color: #111111" active="color: #222222">no rule</div>
<div style={on ? 'opacity: 0.75' : null}>changing style</div>
<div hover={on ? 'color: #333333' : null}>changing hover</div>
<div active={on ? 'color: #444444' : null}>changing active</div>
<div focus-visible={on ? 'color: #555555' : null}>changing focus-visible</div>

<style>
	.btn.primary {
		color: green;
	}
	.btn {
		color: red;
		padding: 4px 8px;
	}
	.btn:hover {
		color: blue;
	}
	.btn:active {
		color: yellow;
	}
	.btn:hover:active {
		color: pink;
	}
	:hover {
		color: pink;
	}
	.btn:constructor {
		color: purple;
	}
	@media (min-width: 1px) {
		.btn {
			color: pink;
		}
	}
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: #000000;
	}
	.on {
		background-color: #333333;
	}
	.a {
		opacity: 0.5;
	}
	.b {
		opacity: 1;
	}
	.card .title {
		font-size: 20px;
	}
	.card {
		color: gold;
		&:hover {
			color: pink;
		}
	}
	div.tagged {
		color: teal;
	}
	.tagged {
		color: red;
	}
	.earlier {
		color: red;
	}
	.later {
		color: navy;
	}
	.first,
	.second {
		opacity: 0.25;
	}
	div {
		gap: 4px;
		color: gray;
	}
</style>
