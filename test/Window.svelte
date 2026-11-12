<script lang="ts">
	import { window_size, window_insets, selected_text } from 'gpuix-svelte';
</script>

<div style="display: flex; flex-direction: column; gap: 8px; padding: 8px">
	<div testId="size">{window_size.width}x{window_size.height}</div>
	<div testId="insets">{window_insets.visibleHeight}/{window_insets.keyboardVisible}/{window_insets.safeArea.top}</div>
	<text testId="pick" style="width: 200px">Pick these words</text>
	<div testId="selected">{`selected: ${selected_text() ?? 'none'}`}</div>
</div>
