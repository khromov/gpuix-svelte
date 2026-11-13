<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Icon from 'gpuix-svelte-ui/components/Icon.svelte';
	import { chorded, key_of, repeats, type KeyLike } from 'gpuix-svelte-ui/keys';
	import { aria_disabled, own_hitbox, test_id, type Option } from 'gpuix-svelte-ui/shared';

	let {
		options,
		value,
		onchange,
		placeholder = 'Select…',
		label = null,
		disabled = false,
		testid = null
	}: {
		options: Option[];
		value: string | null;
		onchange: (value: string) => void;
		placeholder?: string;
		label?: string | null;
		disabled?: boolean;
		/** The wrapper's id; the trigger gets `<testid>-trigger`, the list's panel `<testid>-list-panel` and each option `<testid>-<value>`. */
		testid?: string | null;
	} = $props();

	let open = $state(false);
	let active = $state(-1);
	const selected = $derived(options.find((o) => o.value === value) ?? null);

	function show() {
		if (disabled) return;
		const chosen = options.findIndex((o) => o.value === value && !o.disabled);
		active = chosen === -1 ? options.findIndex((o) => !o.disabled) : chosen;
		open = true;
	}

	function choose(option: Option) {
		if (option.disabled) return;
		if (option.value !== value) onchange(option.value);
		open = false;
	}

	function move(delta: number) {
		for (let step = 1; step <= options.length; step++) {
			const i = (active + delta * step + options.length * step) % options.length;
			if (!options[i].disabled) {
				active = i;
				return;
			}
		}
	}

	// The trigger keeps focus while the list is open, so the keys arrive here on both renderers.
	function keydown(e: KeyLike) {
		const key = key_of(e);
		// Alt+Down opens a list box by convention, so a chord is only refused for the other keys.
		if (chorded(e) && (open || (key !== 'down' && key !== 'up'))) return;
		const press = key === 'enter' || key === 'space';
		// A held Enter or Space repeats, and the press that opened the list must not go on to pick from it.
		if (press && repeats(e)) {
			e.preventDefault();
			return;
		}
		if (!open) {
			if (press || key === 'down' || key === 'up') {
				e.preventDefault();
				show();
			}
			return;
		}
		if (key === 'down' || key === 'up') {
			e.preventDefault();
			move(key === 'down' ? 1 : -1);
		} else if (press) {
			e.preventDefault();
			if (options[active]) choose(options[active]);
		} else if (key === 'tab') {
			open = false;
		}
	}
</script>

<div class="select" class:disabled {...test_id(testid)}>
	{#if label}<div class="label">{label}</div>{/if}
	<Popover {open} onclose={() => (open = false)} style="padding: 4px; min-width: 180px" testid={testid ? `${testid}-list` : null}>
		<div
			class="trigger"
			class:open
			class:disabled
			role="button"
			aria-label={label}
			aria-expanded={open}
			tabindex={disabled ? -1 : 0}
			{...aria_disabled(disabled)}
			{...own_hitbox}
			{...test_id(testid ? `${testid}-trigger` : null)}
			onclick={() => (open ? (open = false) : show())}
			onkeydown={keydown}
		>
			<div class="value" class:placeholder={selected === null}>{selected?.label ?? placeholder}</div>
			<Icon name="chevron-down" size={14} />
		</div>
		{#snippet content()}
			<div class="list" role="listbox">
				{#each options as option, i (option.value)}
					<div
						class="option"
						class:active={i === active}
						class:disabled={option.disabled}
						role="option"
						aria-selected={option.value === value}
						{...aria_disabled(option.disabled)}
						{...own_hitbox}
						{...test_id(testid ? `${testid}-${option.value}` : null)}
						onclick={() => choose(option)}
						onmouseenter={() => {
							if (!option.disabled) active = i;
						}}
					>
						<div class="text">
							<div class="option-label">{option.label}</div>
							{#if option.description}<div class="description">{option.description}</div>{/if}
						</div>
						{#if option.value === value}<Icon name="check" size={12} />{/if}
					</div>
				{/each}
			</div>
		{/snippet}
	</Popover>
</div>

<style>
	.select {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.select.disabled {
		opacity: 0.5;
	}
	.trigger.disabled {
		pointer-events: none;
	}
	.label {
		font-size: 13px;
		font-weight: 500;
		line-height: 18px;
		color: var(--ui-ink);
	}
	.trigger {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 180px;
		height: 34px;
		padding: 0 10px;
		border-radius: 8px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		font-size: 14px;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-ink);
	}
	.trigger:hover {
		border-color: var(--ui-muted);
	}
	.trigger:focus-visible {
		border-color: var(--ui-accent);
	}
	.trigger.open {
		border-color: var(--ui-accent);
	}
	.trigger.open:hover {
		border-color: var(--ui-accent);
	}
	.value.placeholder {
		color: var(--ui-muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.option {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 14px;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		color: var(--ui-ink);
	}
	.option.active {
		background-color: var(--ui-raised-hover);
	}
	.option.disabled {
		opacity: 0.5;
	}
	.text {
		display: flex;
		flex-direction: column;
	}
	.description {
		font-size: 12px;
		line-height: 16px;
		color: var(--ui-muted);
	}
</style>
