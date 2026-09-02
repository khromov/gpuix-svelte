<script lang="ts">
	let broken = $state(0);
	let fixed = $state(0);

	const BUTTON =
		'display: flex; flex-direction: row; align-items: center; gap: 8px; ' +
		'padding: 10px 16px; border-radius: 8px; background-color: #313244; ' +
		'color: #cdd6f4; font-size: 13px; cursor: pointer';
	const BADGE = 'padding: 2px 8px; border-radius: 10px; color: #1e1e2e; font-size: 11px';
</script>

<div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 24px">
	<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">
		<div style={BUTTON} hover="background-color: #45475a" onclick={() => broken++}>
			Save
			<div style="{BADGE}; background-color: #f38ba8">badge</div>
		</div>
		<div style="font-size: 12px; color: #a6adc8">broken: {broken} clicks</div>
	</div>

	<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">
		<div style={BUTTON} hover="background-color: #45475a" hitbox="self" onclick={() => fixed++}>
			Save
			<div style="{BADGE}; background-color: #a6e3a1">badge</div>
		</div>
		<div style="font-size: 12px; color: #a6adc8">fixed: {fixed} clicks</div>
	</div>
</div>
