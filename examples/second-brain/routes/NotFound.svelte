<script lang="ts">
	import EmptyState from '../components/EmptyState.svelte';
	import { replace } from '../lib/router.svelte.ts';
</script>

<div class="route">
	<EmptyState icon="alert" title="Nothing here" body="That route does not exist." action={{ label: 'Back to Everything', onclick: () => replace('/') }} />
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
</style>
