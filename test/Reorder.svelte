<script lang="ts">
	let items = $state([1, 2, 3, 4, 5]);
	let show = $state(true);

	export function set(next: number[]) {
		items = next;
	}
	export function toggle(next: boolean) {
		show = next;
	}
</script>

<div>
	<div>head</div>
	{#if show}<div>IF</div>{/if}
	{#each items as i (i)}<div>{i}</div>{/each}
	<div>tail</div>
</div>
