<script lang="ts">
	let broken = $state(0);
	let fixed = $state(0);

	const BUTTON =
		'display: flex; flex-direction: row; align-items: center; gap: 8px; ' +
		'padding: 10px 16px; border-radius: 8px; background-color: #1c1c1c; ' +
		'color: #ededed; font-size: 13px; cursor: pointer';
	const BADGE = 'padding: 2px 8px; border-radius: 10px; color: #000000; font-size: 11px';
</script>

<div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 24px">
	<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">
		<div style={BUTTON} hover="background-color: #262626" onclick={() => broken++}>
			Save
			<div style="{BADGE}; background-color: #ff6166">badge</div>
		</div>
		<div style="font-size: 12px; color: #a1a1a1">broken: {broken} clicks</div>
	</div>

	<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">
		<div style={BUTTON} hover="background-color: #262626" hitbox="self" onclick={() => fixed++}>
			Save
			<div style="{BADGE}; background-color: #4cc38a">badge</div>
		</div>
		<div style="font-size: 12px; color: #a1a1a1">fixed: {fixed} clicks</div>
	</div>
</div>
