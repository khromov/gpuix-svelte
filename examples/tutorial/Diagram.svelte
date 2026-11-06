<script lang="ts">
	import type { Diagram, TreeSpec } from './steps.ts';

	let { spec }: { spec: Diagram } = $props();

	type Flat = { label: string; note?: string; depth: number; virtual: boolean };

	function flatten(tree: TreeSpec, depth = 0, out: Flat[] = []) {
		out.push({ label: tree.label, note: tree.note, depth, virtual: tree.virtual === true });
		for (const child of tree.children ?? []) flatten(child, depth + 1, out);
		return out;
	}

	const column = $derived(spec.direction === 'column');
	const BOX =
		'padding: 5px 10px; border-width: 1px; border-radius: 6px; font-family: Menlo; font-size: 12px; pointer-events: none';
</script>

<div
	style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background-color: #111111;
	       border-width: 1px; border-color: #242424; border-radius: 10px; user-select: none"
>
	{#if spec.title}
		<div style="font-size: 11px; font-weight: 600; color: #ededed">{spec.title}</div>
	{/if}

	{#if spec.kind === 'pipeline'}
		<div
			style="display: flex; gap: 8px"
			style:flex-direction={column ? 'column' : 'row'}
			style:flex-wrap={column ? 'nowrap' : 'wrap'}
			style:align-items={column ? 'flex-start' : 'center'}
		>
			{#each spec.nodes as node, i (node)}
				{#if i > 0}
					<div style="color: #8f8f8f; font-size: 16px; pointer-events: none" style:padding-left={column ? '14px' : '0px'}>
						{column ? '↓' : '→'}
					</div>
				{/if}
				<div style="display: flex; flex-direction: column; gap: 3px; pointer-events: none" style:align-items={column ? 'flex-start' : 'center'}>
					<div style="{BOX}; background-color: #1c1c1c; color: #ededed" style:border-color={node.color ?? '#404040'}>{node.label}</div>
					{#if node.caption}
						<div style="font-size: 11px; color: #a1a1a1">{node.caption}</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else if spec.kind === 'compare'}
		<div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px">
			{#each [spec.left, spec.right] as side (side)}
				<div style="display: flex; flex-direction: column; gap: 5px; flex-grow: 1; flex-basis: 200px; min-width: 0">
					<div style="font-size: 12px; font-weight: 600; margin-bottom: 2px" style:color={side.color ?? '#a1a1a1'}>
						{side.title}
					</div>
					{#each flatten(side.tree) as row (row)}
						<div
							style="display: flex; flex-direction: column; gap: 3px; pointer-events: none"
							style:padding-left="{row.depth * 16}px"
						>
							<div style="display: flex; flex-direction: row">
								<div
									style="{BOX}; min-width: 0"
									style:background-color={row.virtual ? '#111111' : '#1c1c1c'}
									style:border-color={row.virtual ? '#242424' : '#404040'}
									style:color={row.virtual ? '#8f8f8f' : '#ededed'}
								>
									{row.label}
								</div>
							</div>
							{#if row.note}
								<div style="font-size: 11px; color: #a1a1a1; padding-left: 4px">{row.note}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	{#if spec.legend}
		<div style="font-size: 11px; color: #a1a1a1">{spec.legend}</div>
	{/if}
</div>
