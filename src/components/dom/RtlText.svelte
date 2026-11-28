<script lang="ts">
	let { text, style = null }: { text: string; style?: string | null } = $props();
</script>

<div class="rtl" dir="rtl" {style}>{text}</div>

<style>
	.rtl { width: 100%; }
</style>
