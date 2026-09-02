<script lang="ts">
	let on = $state(false);
</script>

<div
	style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center;
	       gap: 12px"
>
	<div
		style="padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer"
		style:background-color={on ? '#89b4fa' : '#313244'}
		style:color={on ? '#1e1e2e' : '#cdd6f4'}
		hover="opacity: 0.85"
		active="opacity: 0.6"
		onclick={() => (on = !on)}
	>
		style: directive — {on ? 'on' : 'off'}
	</div>

	<div class="chip">class rule — hover me</div>

	<div
		style="padding: 8px 16px; border-width: 2px; border-color: #f9e2af;
		       border-radius: 8px; color: #f9e2af; font-size: 13px"
	>
		border-width + border-color
	</div>

	<div style="padding: 8px 16px; border: 1px solid #f38ba8; color: #f38ba8; font-size: 13px">
		border: 1px solid — dropped, see the terminal
	</div>
</div>

<style>
	.chip {
		padding: 8px 16px;
		border-radius: 999px;
		background-color: #cba6f7;
		color: #1e1e2e;
		font-size: 13px;
		font-weight: bold;
	}
	.chip:hover {
		background-color: #f5c2e7;
	}
</style>
