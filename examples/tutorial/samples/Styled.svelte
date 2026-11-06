<script lang="ts">
	let on = $state(false);
</script>

<div
	style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center;
	       gap: 12px"
>
	<div
		style="padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer"
		style:background-color={on ? '#ededed' : '#1c1c1c'}
		style:color={on ? '#000000' : '#ededed'}
		hover="opacity: 0.85"
		active="opacity: 0.6"
		onclick={() => (on = !on)}
	>
		style: directive — {on ? 'on' : 'off'}
	</div>

	<div class="chip">class rule — hover me</div>

	<div
		style="padding: 8px 16px; border-width: 2px; border-color: #f5a524;
		       border-radius: 8px; color: #f5a524; font-size: 13px"
	>
		border-width + border-color
	</div>

	<div style="padding: 8px 16px; border: 1px solid #ff6166; color: #ff6166; font-size: 13px">
		border: 1px solid — dropped, see the terminal
	</div>
</div>

<style>
	.chip {
		padding: 8px 16px;
		border-radius: 999px;
		background-color: #ff3e00;
		color: #ffffff;
		font-size: 13px;
		font-weight: 600;
	}
	.chip:hover {
		background-color: #ff6a33;
	}
</style>
