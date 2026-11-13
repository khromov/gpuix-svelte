<script lang="ts">
	import { activates, chorded, key_of, type KeyLike } from 'gpuix-svelte-ui/keys';
	import { aria_checked, aria_disabled, focus_node, own_hitbox, test_id, type Option } from 'gpuix-svelte-ui/shared';

	let {
		options,
		value,
		onchange,
		direction = 'column',
		label = null,
		disabled = false,
		testid = null
	}: {
		options: Option[];
		value: string | null;
		onchange: (value: string) => void;
		direction?: 'column' | 'row';
		label?: string | null;
		disabled?: boolean;
		/** The group's id; each radio gets `<testid>-<value>`. */
		testid?: string | null;
	} = $props();

	const enabled = (option: Option) => !disabled && !option.disabled;
	const nodes: Record<string, unknown> = {};
	// One tab stop per group, as a native one has: the selected radio, or the first enabled one while none is.
	const stop = $derived(options.find((o) => o.value === value && enabled(o)) ?? options.find(enabled) ?? null);

	function choose(option: Option) {
		if (enabled(option) && option.value !== value) onchange(option.value);
	}

	// Arrows move the selection itself, and focus with it, as native radio groups do; Enter and Space select the focused one.
	function keydown(e: KeyLike, from: number) {
		if (chorded(e)) return;
		const key = key_of(e);
		const delta = key === 'down' || key === 'right' ? 1 : key === 'up' || key === 'left' ? -1 : 0;
		if (delta === 0) {
			if (activates(e)) choose(options[from]);
			return;
		}
		e.preventDefault();
		for (let step = 1; step <= options.length; step++) {
			const next = options[(from + delta * step + options.length * step) % options.length];
			if (enabled(next)) {
				choose(next);
				focus_node(nodes[next.value]);
				return;
			}
		}
	}
</script>

<div class="group {direction}" role="radiogroup" aria-label={label} {...test_id(testid)}>
	{#each options as option, i (option.value)}
		<div
			class="radio"
			class:disabled={!enabled(option)}
			role="radio"
			aria-label={option.label}
			{...aria_checked(option.value === value)}
			tabindex={option === stop ? 0 : -1}
			{...aria_disabled(!enabled(option))}
			{...own_hitbox}
			{...test_id(testid ? `${testid}-${option.value}` : null)}
			{@attach (node: unknown) => {
				nodes[option.value] = node;
			}}
			onclick={() => choose(option)}
			onkeydown={(e) => keydown(e, i)}
		>
			<div class="ring" class:on={option.value === value}>
				{#if option.value === value}<div class="dot"></div>{/if}
			</div>
			<div class="text">
				<div class="label">{option.label}</div>
				{#if option.description}<div class="description">{option.description}</div>{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.group {
		display: flex;
		gap: 10px;
	}
	.group.column {
		flex-direction: column;
	}
	.group.row {
		flex-direction: row;
		flex-wrap: wrap;
		gap: 16px;
	}
	.radio {
		display: flex;
		flex-direction: row;
		align-items: start;
		gap: 10px;
		cursor: pointer;
		user-select: none;
		border-radius: 6px;
	}
	.radio:focus-visible {
		outline-width: 2px;
		outline-offset: 2px;
		outline-style: solid;
		outline-color: var(--ui-ink);
	}
	.radio.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.ring {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		margin-top: 1px;
		border-radius: 9px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		flex-shrink: 0;
		box-sizing: border-box;
		background-color: var(--ui-panel);
	}
	.ring.on {
		border-color: var(--ui-accent);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background-color: var(--ui-accent);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.label {
		font-size: 14px;
		line-height: 20px;
		color: var(--ui-ink);
	}
	.description {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
</style>
