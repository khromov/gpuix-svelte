<script>
	// A port of counter.tsx, plus the control flow that a React reconciler never
	// has to deal with: {#if} and keyed {#each} both leave anchor nodes in
	// Svelte's tree that GPUI cannot represent, so they are the interesting part.
	let count = $state(0);
	let hovered = $state(false);

	let next_id = 3;
	let items = $state([
		{ id: 0, label: 'alpha' },
		{ id: 1, label: 'beta' },
		{ id: 2, label: 'gamma' }
	]);

	const NAMES = ['delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota'];

	function add() {
		const label = NAMES[next_id % NAMES.length];
		items.push({ id: next_id++, label });
	}

	function shuffle() {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[items[i], items[j]] = [items[j], items[i]];
		}
	}
</script>

<div
	style="display: flex; flex-direction: row; align-items: center; justify-content: center;
	       gap: 24px; width: 100%; height: 100%; background-color: #11111b; padding: 24px"
>
	<!-- counter card -->
	<div
		style="display: flex; flex-direction: column; align-items: center; justify-content: center;
		       gap: 16px; padding: 32px; width: 380px; background-color: #1e1e2e; border-radius: 12px"
	>
		<div
			style="font-size: 48px; font-weight: bold; color: #cdd6f4; cursor: pointer"
			onclick={() => count++}
		>
			{count}
		</div>

		<div style="color: #a6adc8; font-size: 14px">Click the number or + to increment</div>

		<div style="display: flex; flex-direction: row; gap: 12px">
			<div
				style="padding: 12px; padding-left: 24px; padding-right: 24px; border-radius: 8px"
				style:background-color={count > 0 ? '#f38ba8' : '#6c7086'}
				style:cursor={count > 0 ? 'pointer' : 'default'}
				style:opacity={count > 0 ? 1 : 0.5}
				onclick={() => count > 0 && count--}
			>
				<div style="color: #1e1e2e; font-weight: bold">-</div>
			</div>

			<div
				style="padding: 12px; padding-left: 24px; padding-right: 24px;
				       border-radius: 8px; cursor: pointer;
				       background-color: {hovered ? '#94e2d5' : '#a6e3a1'}"
				onclick={() => count++}
				onmouseenter={() => (hovered = true)}
				onmouseleave={() => (hovered = false)}
			>
				<div style="color: #1e1e2e; font-weight: bold">+</div>
			</div>
		</div>

		{#if count > 0}
			<div style="color: #f9e2af; font-size: 13px">
				{count} click{count === 1 ? '' : 's'} — the {'{#if}'} branch is live
			</div>
		{/if}

		<div
			style="margin-top: 16px; padding: 16px; background-color: #313244;
			       border-radius: 8px; cursor: pointer"
			hover="background-color: #45475a"
			onclick={() => (count = 0)}
		>
			<div style="color: #bac2de; font-size: 14px">Reset</div>
		</div>
	</div>

	<!-- keyed each-block card -->
	<div
		style="display: flex; flex-direction: column; gap: 12px; padding: 24px; width: 320px;
		       background-color: #1e1e2e; border-radius: 12px"
	>
		<div style="color: #cdd6f4; font-size: 16px; font-weight: bold">Keyed list</div>

		{#each items as item (item.id)}
			<div
				style="display: flex; flex-direction: row; justify-content: space-between;
				       padding: 10px; background-color: #313244; border-radius: 6px;
				       color: #cdd6f4; font-size: 14px; cursor: pointer"
				hover="background-color: #45475a"
				onclick={() => (items = items.filter((i) => i.id !== item.id))}
			>
				<div>{item.label}</div>
				<div style="color: #6c7086">#{item.id}</div>
			</div>
		{/each}

		{#if items.length === 0}
			<div style="color: #6c7086; font-size: 13px">empty — add something</div>
		{/if}

		<div style="display: flex; flex-direction: row; gap: 8px; margin-top: 8px">
			<div
				style="padding: 8px; padding-left: 14px; padding-right: 14px; border-radius: 6px;
				       background-color: #89b4fa; color: #1e1e2e; font-size: 13px;
				       font-weight: bold; cursor: pointer"
				hover="background-color: #b4befe"
				onclick={add}
			>
				add
			</div>
			<div
				style="padding: 8px; padding-left: 14px; padding-right: 14px; border-radius: 6px;
				       background-color: #cba6f7; color: #1e1e2e; font-size: 13px;
				       font-weight: bold; cursor: pointer"
				hover="background-color: #ddb6f2"
				onclick={shuffle}
			>
				shuffle
			</div>
		</div>

		<div style="color: #6c7086; font-size: 12px">click a row to remove it</div>
	</div>
</div>
