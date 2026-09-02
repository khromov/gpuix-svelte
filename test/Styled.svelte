<script lang="ts">
	// The selectors below cover what compile.ts accepts, plus one it must refuse.
	let on = $state(false);
	let kind = $state('a');
</script>

<div class="btn" class:on onclick={() => (on = !on)}>toggle</div>
<div class="btn" style="color: #000000">inline</div>
<div class="btn" hover="color: #ffffff">attr</div>
<div class="btn primary">compound</div>
<div class={kind} onclick={() => (kind = kind === 'a' ? 'b' : 'a')}>dynamic</div>
<div class="card"><div class="title">nested</div></div>

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
	div {
		gap: 4px;
	}
</style>
