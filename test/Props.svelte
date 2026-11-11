<script lang="ts">
	let rows = $state(6);
	const not_a_number = 'many' as unknown as number;
	const source = 'a\nb';

	export function set_rows(value: unknown) {
		rows = value as number;
	}
</script>

<div class="page">
	<div class="row">
		<textarea class="field" testId="rows-text" minRows="6"></textarea>
		<textarea class="field" testId="rows-number" minRows={6}></textarea>
		<textarea class="field" testId="rows-none"></textarea>
		<textarea class="field" testId="rows-live" minRows={rows} maxRows={not_a_number}></textarea>
		<textarea class="field" testId="rows-bad" maxRows={not_a_number}></textarea>
	</div>
	<div class="row">
		<code testId="lines-bare" code={source} showLineNumbers></code>
		<code testId="lines-false" code={source} showLineNumbers="false"></code>
		<input class="field" testId="readonly" readonly />
		<diff testId="diff" wordDiff scroll="false" maxLines="5"></diff>
	</div>
	<virtual-list testId="list" followTail estimatedItemHeight="20" class="list"></virtual-list>
	<div class="raw">
		<anchored testId="layer" side="top" priority="2" occlude="false" deferred snapMargin="8"><div>tip</div></anchored>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 8px; padding: 8px; width: 100%; height: 100%; }
	.row { display: flex; flex-direction: row; gap: 8px; align-items: start; }
	.field { width: 80px; }
	.list { width: 100px; height: 40px; }
	.raw { position: relative; width: 40px; height: 20px; }
</style>
