<script>
	import { IS_GPUIX, set_css_vars, window_size } from 'gpuix-svelte';

	const DARK = { paper: '#000000', panel: '#111111', line: '#242424', ink: '#ededed', dim: '#a1a1a1' };
	const LIGHT = { paper: '#fafafa', panel: '#ffffff', line: '#e5e5e5', ink: '#171717', dim: '#6b6b6b' };

	let dark = $state(true);

	$effect(() => set_css_vars(dark ? DARK : LIGHT));
</script>

<div class="app">
	<div class="card">
		<div class="row">
			<div class="badge">{IS_GPUIX ? 'GPUI' : 'DOM'}</div>
			<div class="dim">{window_size.width} × {window_size.height}</div>
		</div>
		<div>One source, two renderers. Switch the renderer above the result and this badge follows; the colours come from one set_css_vars call on either.</div>
		<div class="btn" onclick={() => (dark = !dark)}>{dark ? 'Light' : 'Dark'} theme</div>
	</div>
</div>

<style>
	.app {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 24px;
		background-color: var(--paper);
		color: var(--ink);
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
		max-width: 380px;
		padding: 20px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--line);
		border-radius: 12px;
		background-color: var(--panel);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.badge {
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		background-color: var(--ink);
		color: var(--paper);
	}
	.btn {
		padding: 6px 12px;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		background-color: var(--ink);
		color: var(--paper);
	}
	.dim {
		color: var(--dim);
	}
</style>
