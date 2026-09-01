<script>
	let on = $state(false);
</script>

<div style="display: flex; flex-direction: row; align-items: center; gap: 16px">
	<div
		style="position: relative; width: 52px; height: 30px; border-radius: 15px;
		       cursor: pointer"
		style:background-color={on ? '#a6e3a1' : '#585b70'}
		onclick={() => (on = !on)}
	>
		<div
			style="position: absolute; top: 3px; width: 24px; height: 24px;
			       border-radius: 12px; background-color: #ffffff; pointer-events: none"
			motion={{
				initial: false,
				animate: { left: on ? 25 : 3 },
				transition: { duration: 0.25, ease: 'easeOut' }
			}}
		></div>
	</div>

	<div style="font-size: 13px; color: #cdd6f4">{on ? 'on' : 'off'} — click the toggle</div>

	<div
		style="width: 40px; height: 40px; background-color: #cba6f7"
		motion={{
			initial: false,
			animate: { opacity: on ? 1 : 0.3, borderRadius: on ? 20 : 6 },
			transition: { duration: 0.4, ease: 'easeInOut' }
		}}
	></div>
</div>
