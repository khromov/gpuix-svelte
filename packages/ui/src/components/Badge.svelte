<script lang="ts">
	import type { Snippet } from 'svelte';
	import { test_id, type Tone } from 'gpuix-svelte-ui/shared';

	let { children, tone = 'neutral', testid = null }: { children: Snippet; tone?: Tone; testid?: string | null } = $props();
</script>

<div class="badge {tone}" {...test_id(testid)}>{@render children()}</div>

<style>
	.badge {
		display: flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border);
		font-size: 12px;
		font-weight: 500;
		line-height: 16px;
		white-space: nowrap;
		background-color: var(--ui-raised);
		color: var(--ui-ink);
	}
	.badge.accent {
		border-color: var(--ui-accent-wash);
		background-color: var(--ui-accent-wash);
		color: var(--ui-accent-ink);
	}
	.badge.success {
		border-color: var(--ui-success-wash);
		background-color: var(--ui-success-wash);
		color: var(--ui-success);
	}
	.badge.warning {
		border-color: var(--ui-warning-wash);
		background-color: var(--ui-warning-wash);
		color: var(--ui-warning);
	}
	.badge.danger {
		border-color: var(--ui-danger-wash);
		background-color: var(--ui-danger-wash);
		color: var(--ui-danger);
	}
</style>
