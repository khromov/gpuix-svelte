<script>
	let wifi = $state(true);
	let bluetooth = $state(true);
	let airdrop = $state(false);
	let focus = $state(false);
	let night = $state(true);
	let brightness = $state(0.7);
	let volume = $state(0.45);
	let playing = $state(true);
	let progress = $state(0.3);
	let now = $state(new Date());

	$effect(() => {
		const t = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		if (!playing) return;
		const t = setInterval(() => (progress = (progress + 0.004) % 1), 150);
		return () => clearInterval(t);
	});

	// GPUI captures no pointer for us, so a drag is: mousedown on the track,
	// then mousemove/mouseup handled by the surfaces above it (track, card, root).
	const HOST = Symbol.for('gpuix.svelte.host');
	let drag = $state(null);

	function slide(e) {
		const native = globalThis[HOST]?.native;
		const bounds = native?.getElementBounds(drag.trackId);
		if (!bounds) return;
		const value = Math.min(1, Math.max(0, (e.x - bounds[0]) / bounds[2]));
		if (drag.key === 'brightness') brightness = value;
		else volume = value;
	}

	function press(key, e) {
		drag = { key, trackId: e.target.nativeId };
		slide(e);
	}

	function move(e) {
		if (!drag) return;
		// a mouseUp that lands on a surface without our listener never arrives;
		// the payload's button state is the truth, so a buttonless move ends the drag
		if (e.pressedButton == null) {
			drag = null;
			return;
		}
		slide(e);
	}

	function release() {
		drag = null;
	}

	const clock = $derived(
		now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
	);

	// glass material tokens
	const CARD =
		'background-color: rgba(255,255,255,0.10); border-width: 1px; ' +
		'border-color: rgba(255,255,255,0.18); border-radius: 22px';
	const HAIRLINE = 'background-color: rgba(255,255,255,0.35); height: 1px; border-radius: 1px';
	const KNOB =
		'position: absolute; top: 2px; width: 22px; height: 22px; border-radius: 11px; ' +
		'background-color: #ffffff; pointer-events: none';
</script>

<div
	style="display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%;
	       background-color: rgba(22, 22, 34, 0.42); padding: 22px; padding-top: 44px"
	onmousemove={move}
	onmouseup={release}
>
	<div style="display: flex; flex-direction: column; gap: 14px; width: 100%">
		<!-- header -->
		<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between">
			<div style="color: rgba(255,255,255,0.95); font-size: 20px; font-weight: bold">
				Control Center
			</div>
			<div style="color: rgba(255,255,255,0.7); font-size: 15px">{clock}</div>
		</div>

		<!-- connectivity -->
		<div
			style="display: flex; flex-direction: column; gap: 2px; padding: 16px; {CARD}"
			onmousemove={move}
			onmouseup={release}
		>
			{#each [
				{ label: 'Wi-Fi', detail: 'HomeNetwork', get on() { return wifi; }, flip: () => (wifi = !wifi) },
				{ label: 'Bluetooth', detail: 'On', get on() { return bluetooth; }, flip: () => (bluetooth = !bluetooth) },
				{ label: 'AirDrop', detail: 'Contacts only', get on() { return airdrop; }, flip: () => (airdrop = !airdrop) }
			] as row (row.label)}
				<div
					style="display: flex; flex-direction: row; align-items: center; gap: 12px;
					       padding: 8px; border-radius: 12px; cursor: pointer"
					hover="background-color: rgba(255,255,255,0.07)"
					onclick={row.flip}
				>
					<div
						style="width: 10px; height: 10px; border-radius: 5px; pointer-events: none"
						style:background-color={row.on ? '#0a84ff' : 'rgba(255,255,255,0.3)'}
					></div>
					<div style="display: flex; flex-direction: column; flex-grow: 1">
						<div style="color: rgba(255,255,255,0.92); font-size: 14px">{row.label}</div>
						<div style="color: rgba(255,255,255,0.45); font-size: 11px">
							{row.on ? row.detail : 'Off'}
						</div>
					</div>
					<div
						style="width: 44px; height: 26px; border-radius: 13px; pointer-events: none"
						style:background-color={row.on ? 'rgba(48,209,88,0.9)' : 'rgba(120,120,128,0.4)'}
					>
						<div
							style={KNOB}
							motion={{
								initial: false,
								animate: { left: row.on ? 20 : 2 },
								transition: { duration: 0.18, ease: 'easeOut' }
							}}
						></div>
					</div>
				</div>
			{/each}
		</div>

		<!-- media player -->
		<div
			style="display: flex; flex-direction: column; gap: 12px; padding: 18px; {CARD}"
			onmousemove={move}
			onmouseup={release}
		>
			<div style={HAIRLINE}></div>
			<div style="display: flex; flex-direction: row; align-items: center; gap: 12px">
				<div
					style="display: flex; align-items: center; justify-content: center; width: 46px;
					       height: 46px; border-radius: 12px; background-color: rgba(255,255,255,0.14)"
				>
					<div style="color: rgba(255,255,255,0.85); font-size: 20px">♪</div>
				</div>
				<div style="display: flex; flex-direction: column; flex-grow: 1">
					<div style="color: rgba(255,255,255,0.92); font-size: 14px; font-weight: bold">
						Weightless
					</div>
					<div style="color: rgba(255,255,255,0.5); font-size: 12px">Marconi Union</div>
				</div>
			</div>

			<div
				style="display: flex; flex-direction: row; height: 4px; border-radius: 2px;
				       background-color: rgba(255,255,255,0.18); overflow: hidden"
			>
				<div
					style="height: 4px; background-color: rgba(255,255,255,0.85); border-radius: 2px;
					       pointer-events: none"
					style:width={`${Math.round(progress * 100)}%`}
				></div>
			</div>

			<div style="display: flex; flex-direction: row; justify-content: center; gap: 18px">
				<div
					style="display: flex; align-items: center; justify-content: center; width: 40px;
					       height: 40px; border-radius: 20px; cursor: pointer;
					       background-color: rgba(255,255,255,0.10)"
					hover="background-color: rgba(255,255,255,0.2)"
					onclick={() => (progress = 0)}
				>
					<div style="color: rgba(255,255,255,0.9); font-size: 15px">«</div>
				</div>
				<div
					style="display: flex; flex-direction: row; align-items: center; justify-content: center;
					       gap: 4px; width: 48px; height: 48px; border-radius: 24px; cursor: pointer;
					       background-color: rgba(255,255,255,0.22)"
					hover="background-color: rgba(255,255,255,0.32)"
					onclick={() => (playing = !playing)}
				>
					{#if playing}
						<div
							style="width: 5px; height: 16px; border-radius: 2px; background-color: #ffffff;
							       pointer-events: none"
						></div>
						<div
							style="width: 5px; height: 16px; border-radius: 2px; background-color: #ffffff;
							       pointer-events: none"
						></div>
					{:else}
						<div style="color: #ffffff; font-size: 18px">▶</div>
					{/if}
				</div>
				<div
					style="display: flex; align-items: center; justify-content: center; width: 40px;
					       height: 40px; border-radius: 20px; cursor: pointer;
					       background-color: rgba(255,255,255,0.10)"
					hover="background-color: rgba(255,255,255,0.2)"
					onclick={() => (progress = Math.min(1, progress + 0.1))}
				>
					<div style="color: rgba(255,255,255,0.9); font-size: 15px">»</div>
				</div>
			</div>
		</div>

		<!-- sliders -->
		<div
			style="display: flex; flex-direction: column; gap: 14px; padding: 18px; {CARD}"
			onmousemove={move}
			onmouseup={release}
		>
			{#each [
				{ key: 'brightness', label: 'Brightness', get value() { return brightness; } },
				{ key: 'volume', label: 'Volume', get value() { return volume; } }
			] as slider (slider.key)}
				<div style="display: flex; flex-direction: column; gap: 6px">
					<div style="display: flex; flex-direction: row; justify-content: space-between">
						<div style="color: rgba(255,255,255,0.75); font-size: 12px">{slider.label}</div>
						<div style="color: rgba(255,255,255,0.45); font-size: 12px">
							{Math.round(slider.value * 100)}%
						</div>
					</div>
					<div
						style="display: flex; flex-direction: row; height: 26px; border-radius: 13px;
						       background-color: rgba(255,255,255,0.12); cursor: pointer"
						onmousedown={(e) => press(slider.key, e)}
						onmousemove={move}
						onmouseup={release}
					>
						<div
							style="height: 26px; border-radius: 13px; background-color: rgba(255,255,255,0.85);
							       pointer-events: none"
							style:width={`${Math.round(slider.value * 100)}%`}
						></div>
					</div>
				</div>
			{/each}
		</div>

		<!-- mode pills -->
		<div style="display: flex; flex-direction: row; gap: 12px">
			{#each [
				{ label: 'Focus', get on() { return focus; }, flip: () => (focus = !focus) },
				{ label: 'Night Shift', get on() { return night; }, flip: () => (night = !night) }
			] as pill (pill.label)}
				<div
					style="display: flex; align-items: center; justify-content: center; flex-grow: 1;
					       padding: 12px; cursor: pointer; {CARD}"
					style:background-color={pill.on ? 'rgba(10,132,255,0.55)' : 'rgba(255,255,255,0.10)'}
					hover="border-color: rgba(255,255,255,0.35)"
					onclick={pill.flip}
				>
					<div
						style="font-size: 13px; font-weight: bold"
						style:color={pill.on ? '#ffffff' : 'rgba(255,255,255,0.6)'}
					>
						{pill.label}
					</div>
				</div>
			{/each}
		</div>

		<div style="display: flex; justify-content: center">
			<div style="color: rgba(255,255,255,0.35); font-size: 11px">
				liquid glass — the desktop shows through the blurred window
			</div>
		</div>
	</div>
</div>
