<script lang="ts">
	// {#if} and keyed {#each} both leave anchor nodes in Svelte's tree that GPUI
	// cannot represent, which is the part of this demo worth watching.
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
	       gap: 24px; width: 100%; height: 100%; background-color: #000000; padding: 24px"
>
	<div
		style="display: flex; flex-direction: column; align-items: center; justify-content: center;
		       gap: 16px; padding: 32px; width: 380px; background-color: #111111;
		       border-width: 1px; border-color: #242424; border-radius: 10px"
	>
		<div
			style="font-size: 48px; font-weight: 600; color: #ededed; cursor: pointer"
			onclick={() => count++}
		>
			{count}
		</div>

		<div style="color: #a1a1a1; font-size: 14px">Click the number or + to increment</div>

		<div style="display: flex; flex-direction: row; gap: 12px">
			<div
				style="padding: 12px; padding-left: 24px; padding-right: 24px; border-radius: 8px;
				       border-width: 1px; border-color: #242424"
				style:background-color={count > 0 ? '#1c1c1c' : '#111111'}
				style:cursor={count > 0 ? 'pointer' : 'default'}
				style:opacity={count > 0 ? 1 : 0.5}
				onclick={() => count > 0 && count--}
			>
				<div style="color: #ededed; font-weight: 600">-</div>
			</div>

			<div
				testid="plus"
				style="padding: 12px; padding-left: 24px; padding-right: 24px;
				       border-radius: 8px; border-width: 1px; border-color: #ededed; cursor: pointer;
				       background-color: {hovered ? '#ffffff' : '#ededed'}"
				onclick={() => count++}
				onmouseenter={() => (hovered = true)}
				onmouseleave={() => (hovered = false)}
			>
				<div style="color: #000000; font-weight: 600">+</div>
			</div>
		</div>

		{#if count > 0}
			<div style="color: #ff8a5c; font-size: 13px">
				{count} click{count === 1 ? '' : 's'} — the {'{#if}'} branch is live
			</div>
		{/if}

		<div
			style="margin-top: 16px; padding: 16px; background-color: #111111;
			       border-width: 1px; border-color: #242424; border-radius: 8px; cursor: pointer"
			hover="background-color: #1c1c1c; border-color: #404040"
			onclick={() => (count = 0)}
		>
			<div style="color: #ededed; font-size: 14px">Reset</div>
		</div>
	</div>

	<div
		style="display: flex; flex-direction: column; gap: 12px; padding: 24px; width: 320px;
		       background-color: #111111; border-width: 1px; border-color: #242424; border-radius: 10px"
	>
		<div style="color: #ededed; font-size: 16px; font-weight: 600">Keyed list</div>

		{#each items as item (item.id)}
			<div
				style="display: flex; flex-direction: row; justify-content: space-between;
				       padding: 10px; background-color: #1c1c1c; border-radius: 6px;
				       color: #ededed; font-size: 14px; cursor: pointer"
				hover="background-color: #262626"
				onclick={() => (items = items.filter((i) => i.id !== item.id))}
			>
				<div>{item.label}</div>
				<div style="color: #8f8f8f">#{item.id}</div>
			</div>
		{/each}

		{#if items.length === 0}
			<div style="color: #a1a1a1; font-size: 13px">empty — add something</div>
		{/if}

		<div style="display: flex; flex-direction: row; gap: 8px; margin-top: 8px">
			<div
				style="padding: 8px; padding-left: 14px; padding-right: 14px; border-radius: 8px;
				       border-width: 1px; border-color: #ededed; background-color: #ededed;
				       color: #000000; font-size: 13px; font-weight: 600; cursor: pointer"
				hover="background-color: #ffffff; border-color: #ffffff"
				onclick={add}
			>
				add
			</div>
			<div
				style="padding: 8px; padding-left: 14px; padding-right: 14px; border-radius: 8px;
				       border-width: 1px; border-color: #242424; color: #ededed; font-size: 13px;
				       font-weight: 500; cursor: pointer"
				hover="background-color: #1c1c1c; border-color: #404040"
				onclick={shuffle}
			>
				shuffle
			</div>
		</div>

		<div style="color: #a1a1a1; font-size: 12px">click a row to remove it</div>
	</div>
</div>
