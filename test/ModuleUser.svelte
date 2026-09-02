<script>
	import { store, bump } from './ModuleStore.svelte.js';
</script>

<div style="display: flex; flex-direction: column; gap: 8px; color: #cdd6f4">
	<div>count is {store.count}</div>
	<div onclick={bump} style="padding: 8px; background-color: #313244; cursor: pointer">bump</div>
</div>
