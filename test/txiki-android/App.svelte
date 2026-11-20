<script lang="ts">
	import { onMount } from 'svelte';
	import { get_native } from 'gpuix-svelte/renderer';
	import { prompt_for_paths, type ShadowNode } from 'gpuix-svelte';
	import { readFileSync } from 'node:fs';

	let count = $state(0);
	let ticks = $state(0);
	let network = $state('HTTPS loading');
	let input = $state('');
	let saved = $state('Nothing saved');
	let bridge = $state('Bridge checking');
	let picker = $state('No picker result');
	let image: ShadowNode;

	async function choose_file() {
		try {
			const paths = await prompt_for_paths({ files: true });
			if (!paths?.length) { picker = 'Picker cancelled'; return; }
			const bytes = readFileSync(paths[0]!) as Uint8Array;
			const native = get_native() as unknown as { setImage(id: number, bytes: Uint8Array): void };
			native.setImage(image.nativeId!, bytes);
			const form = new FormData();
			form.append('file', new Blob([Uint8Array.from(bytes)], { type: 'image/png' }), 'upload.png');
			const response = await fetch('http://127.0.0.1:45137/upload', { method: 'POST', body: form });
			if (!response.ok || await response.text() !== 'OK') throw new Error(`HTTP ${response.status}`);
			picker = 'Image uploaded';
		} catch (error) { picker = `Picker failed: ${String(error)}`; }
	}

	onMount(() => {
		const controller = new AbortController();
		const timer = setInterval(() => ticks++, 1000);
		const bridge_test = setTimeout(async () => {
			try {
				const native = get_native() as unknown as { setImagePixels(id: number, width: number, height: number, bytes: Uint8Array): void; registerFont(bytes: Uint8Array): void };
				const host = (globalThis as unknown as { gpuixHost: { writeClipboardText(value: string): void; readClipboardText(): string | null } }).gpuixHost;
				native.setImagePixels(image.nativeId!, 1, 1, new Uint8Array([255, 0, 0, 255]));
				let rejected = false;
				try { native.registerFont(new Uint8Array([0])); } catch { rejected = true; }
				host.writeClipboardText('txiki clipboard');
				let rejected_picker = false;
				try { await prompt_for_paths({ files: false, directories: false }); } catch { rejected_picker = true; }
				if (!rejected) throw new Error('invalid font accepted');
				if (!rejected_picker) throw new Error('invalid picker accepted');
				if (host.readClipboardText() !== 'txiki clipboard') throw new Error('clipboard mismatch');
				bridge = 'Native ready';
			} catch (error) { bridge = `Bridge failed: ${String(error)}`; }
		}, 500);
		fetch('https://example.com/', { signal: controller.signal })
			.then(async response => {
				const text = await response.text();
				if (!response.ok || !text.includes('Example Domain')) throw new Error(`HTTP ${response.status}`);
				network = 'HTTPS OK';
			})
			.catch(error => { if (!controller.signal.aborted) network = `HTTPS failed: ${error.message}`; });
		return () => { clearInterval(timer); clearTimeout(bridge_test); controller.abort(); };
	});
</script>

<div class="page">
	<text class="heading">txiki.js + Svelte</text>
	<text>Rendered by GPUI, not native views</text>
	<text testid="count">Count: {count}</text>
	<button testid="increment" onclick={() => count++}>Increment</button>
	<button testid="reset" onclick={() => count = 0}>Reset</button>
	<text testid="network">{network}</text>
	<text testid="timer">Timer: {ticks}</text>
	<text testid="bridge">{bridge}</text>
	<img {@attach node => { image = node; }} style="width: 8px; height: 8px;" />
	<input testid="input" placeholder="Type here" value={input} onchange={event => input = event.value} />
	<button testid="save" onclick={() => saved = input}>Save input</button>
	<text testid="saved">Saved: {saved}</text>
	<button testid="picker" onclick={choose_file}>Choose file</button>
	<text testid="picker-result">{picker}</text>
</div>

<style>
	.page { width: 100%; height: 100%; padding: 18px; gap: 10px; background-color: #121824; color: #edf2ff; font-size: 18px; }
	.heading { font-size: 28px; font-weight: 700; }
	button { padding: 14px 20px; border-radius: 8px; background-color: #335ad9; color: white; }
	input { height: 48px; width: 100%; background-color: #243044; color: white; padding: 10px; }
</style>
