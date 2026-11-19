<script lang="ts">
	import { onMount } from 'svelte';
	import { prompt_for_paths } from 'gpuix-svelte';
	import { readFileSync } from 'node:fs';
	import { check_filesystem } from './filesystem.ts';

	let count = $state(0);
	let filesystem = $state('Checking filesystem…');
	let selection = $state('No file selected');
	let clipboard = $state('Clipboard untested');
	let input = $state('');
	let input_focused = $state(false);

	function open_link() {
		const host = (globalThis as unknown as { gpuixHost: { openUrl(url: string): void } }).gpuixHost;
		host.openUrl('https://example.com/');
	}

	function check_clipboard() {
		try {
			const host = (globalThis as unknown as { gpuixHost: { writeClipboardText(text: string): void; readClipboardText(): string | null } }).gpuixHost;
			host.writeClipboardText('Svelte clipboard ✓');
			clipboard = host.readClipboardText() === 'Svelte clipboard ✓' ? 'Clipboard passed' : 'Clipboard mismatch';
		} catch (error) {
			clipboard = `Clipboard failed: ${String(error)}`;
		}
	}

	async function open_file() {
		try {
			const paths = await prompt_for_paths({ files: true, multiple: false });
			selection = paths?.length ? `Imported: ${readFileSync(paths[0]!, 'utf8').trim()}` : 'File selection cancelled';
		} catch (error) {
			selection = `File selection failed: ${String(error)}`;
		}
	}
	onMount(() => {
		void check_filesystem().then(
			() => filesystem = 'Filesystem passed',
			(error: unknown) => filesystem = `Filesystem failed: ${String(error)}`
		);
	});
</script>

<div class="screen">
	<text class="heading" role="heading">Mobile counter</text>
	<text class="caption">Svelte and GPUI, running natively</text>
	<text class="count">{count}</text>
	<div class="buttons">
		<button hitbox="self" onclick={() => count--}>−</button>
		<button hitbox="self" onclick={() => count++}>+</button>
	</div>
	<button class="reset" hitbox="self" onclick={() => count = 0}>Reset</button>
	<text class="caption">{filesystem}</text>
	<button class="reset" hitbox="self" onclick={open_file}>Open file</button>
	<text class="caption">{selection}</text>
	<button class="reset" hitbox="self" onclick={check_clipboard}>Check clipboard</button>
	<text class="caption">{clipboard}</text>
	<input aria-label="Accessible input" value={input} onchange={(event) => input = event.value} onfocus={() => input_focused = true} onblur={() => input_focused = false} />
	<text class="caption">{input_focused ? 'Input focused' : 'Input not focused'}</text>
	<text class="caption">Input: {input}</text>
	<button class="reset" hitbox="self" onclick={open_link}>Open website</button>
</div>

<style>
	.screen { display: flex; flex-direction: column; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #141b2d; color: #f5f7ff; gap: 18px; }
	.heading { font-size: 30px; font-weight: 700; }
	.caption { font-size: 16px; color: #b4c2dd; }
	.count { font-size: 64px; font-weight: 700; }
	.buttons { display: flex; flex-direction: row; gap: 16px; }
	button { display: flex; width: 96px; height: 64px; align-items: center; justify-content: center; background-color: #557bea; border-radius: 12px; color: #ffffff; font-size: 28px; }
	.reset { width: 208px; height: 48px; background-color: #303e5e; font-size: 16px; }
</style>
