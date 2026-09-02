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
	style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background-color: #181825;
	       border-radius: 8px; user-select: none"
>
	{#if spec.title}
		<div style="font-size: 11px; font-weight: bold; color: #89b4fa">{spec.title}</div>
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
					<div style="color: #6c7086; font-size: 16px; pointer-events: none" style:padding-left={column ? '14px' : '0px'}>
						{column ? '↓' : '→'}
					</div>
				{/if}
				<div style="display: flex; flex-direction: column; gap: 3px; pointer-events: none" style:align-items={column ? 'flex-start' : 'center'}>
					<div style="{BOX}; color: #cdd6f4" style:border-color={node.color ?? '#89b4fa'}>{node.label}</div>
					{#if node.caption}
						<div style="font-size: 11px; color: #6c7086">{node.caption}</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else if spec.kind === 'compare'}
		<div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px">
			{#each [spec.left, spec.right] as side (side)}
				<div style="display: flex; flex-direction: column; gap: 5px; flex-grow: 1; flex-basis: 200px; min-width: 0">
					<div style="font-size: 12px; font-weight: bold; margin-bottom: 2px" style:color={side.color ?? '#a6adc8'}>
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
									style:border-color={row.virtual ? '#585b70' : '#89b4fa'}
									style:color={row.virtual ? '#7f849c' : '#cdd6f4'}
								>
									{row.label}
								</div>
							</div>
							{#if row.note}
								<div style="font-size: 11px; color: #6c7086; padding-left: 4px">{row.note}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	{#if spec.legend}
		<div style="font-size: 11px; color: #6c7086">{spec.legend}</div>
	{/if}
</div>
