<script lang="ts">
	let count = $state(0);

	setTimeout(() => {
		count = 1;
	}, 0);
</script>

<text>{count}</text>
