<script lang="ts">
	import { onMount } from 'svelte';
	import { asset_path, dismiss_layer } from 'gpuix-svelte';
	import { promises as fs } from 'node:fs';
	import Slider from 'gpuix-svelte-ui/components/Slider.svelte';
	import { MONO } from 'gpuix-svelte-ui/shared';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import { start_router, navigate, router } from 'gpuix-svelte-ui/router';
	import { readFileSync } from 'node:fs';
	import { EventEmitter } from 'node:events';
	import { relative, parse, format } from 'node:path';
	import { fileURLToPath, pathToFileURL } from 'node:url';
	import { mkdtemp } from 'node:fs/promises';

	let value = $state(25);
	let overlay = $state(false);
	let secondary = $state(0);
	let filesystem = $state('Filesystem checking');
	let ticks = $state(0);
	const resource = new URL('../assets/icon.png', import.meta.url);
	const resourceDirectory = new URL('.', import.meta.url);
	start_router({ initial: '/' });
	$effect(() => {
		if (overlay) return dismiss_layer({ onEscape: () => overlay = false });
	});
	onMount(() => {
		const timer = setInterval(() => ticks++, 1000);
		(async () => {
			try {
				const emitter = new EventEmitter();
				let emitted = false;
				emitter.once('test', () => emitted = true);
				emitter.emit('test');
				await fs.rm('parity-files', { recursive: true, force: true });
				await fs.mkdir('parity-files', { recursive: true });
				const temporary = await mkdtemp('parity-files/item-');
				const secondTemporary = await mkdtemp('parity-files/item-');
				if (temporary === secondTemporary || !(await fs.stat(temporary)).isDirectory()) throw new Error('mkdtemp failed');
				let rmDirectoryError = '';
				try { await fs.rm(temporary, { force: true }); } catch (error) { rmDirectoryError = (error as { code?: string }).code ?? ''; }
				if (rmDirectoryError !== 'ERR_FS_EISDIR' || !(await fs.stat(temporary)).isDirectory()) throw new Error('rm removed a directory without recursive');
				await fs.rmdir(temporary);
				let notEmpty = '';
				try { await fs.rmdir('parity-files'); } catch (error) { notEmpty = (error as { code?: string }).code ?? ''; }
				if (notEmpty !== 'ENOTEMPTY') throw new Error('rmdir accepted a nonempty directory');
				await fs.rmdir(secondTemporary);
				let yielded = false;
				setTimeout(() => yielded = true, 0);
				await fs.writeFile('parity-files/large', new Uint8Array(65537).fill(42));
				const large = await fs.readFile('parity-files/large');
				await fs.writeFile('parity-files/flags', 'hello', { flag: 'wx+' });
				let plusExclusive = false;
				try { await fs.writeFile('parity-files/flags', 'bad', { flag: 'wx+' }); } catch { plusExclusive = true; }
				await fs.writeFile('parity-files/flags', 'H', { flag: 'r+' });
				const flags = await fs.readFile('parity-files/flags', 'utf8');
				await fs.writeFile('parity-files/test', Buffer.from('68656c6c6f', 'hex'), { flag: 'wx' });
				let exclusive = false;
				try { await fs.writeFile('parity-files/test', 'bad', { flag: 'wx' }); } catch { exclusive = true; }
				const bytes = await fs.readFile('parity-files/test');
				const concurrent = await Promise.all(Array.from({ length: 40 }, () => fs.readFile('parity-files/test', 'utf8')));
				const stat = await fs.stat('parity-files/test');
				const entries = await fs.readdir('parity-files', { withFileTypes: true });
				const encodedEntries = await fs.readdir('parity-files', { encoding: 'buffer', withFileTypes: true });
				const icon = readFileSync(resource);
				const named = readFileSync(asset_path('assets/icon.png')); 
				if (!emitted || resourceDirectory.protocol !== 'file:' || fileURLToPath(pathToFileURL('/tmp/a #%.png')) !== '/tmp/a #%.png' || relative('/a/b', '/a/c') !== '../c' || format(parse('/a/file.txt')) !== '/a/file.txt' || !yielded || !exclusive || !plusExclusive || flags !== 'Hello' || concurrent.some(text => text !== 'hello') || large.length !== 65537 || large[65536] !== 42 || bytes.toString('base64') !== 'aGVsbG8=' || !(stat.mtime instanceof Date) || !entries.some(e => e.name === 'test' && e.isFile()) || !encodedEntries.some(e => Buffer.isBuffer(e.name) && e.name.toString() === 'test' && e.isFile()) || icon[0] !== 137 || named[0] !== 137) throw new Error('Filesystem result mismatch');
				await fs.rm('parity-files', { recursive: true });
				filesystem = 'Filesystem passed';
			} catch (error) { filesystem = String(error); }
		})();
		return () => clearInterval(timer);
	});
</script>

<div class="page" style:--ui-mono={MONO}>
	<text style="font-family: monospace">Mobile parity</text>
	<text>{filesystem}</text>
	<text>Timer: {ticks}</text>
	<Slider {value} onchange={next => value = next} label="Volume" testid="volume" />
	<text>Volume: {value}</text>
	<button onclick={() => navigate('/second')}>Next screen</button>
	<text>Route: {router.path}</text>
	<button onclick={() => overlay = true}>Open overlay</button>
	<text>{overlay ? 'Overlay open' : 'Overlay closed'}</text>
	<button onauxclick={() => secondary++}>Hold secondary</button>
	<text>Secondary: {secondary}</text>
	<Tooltip content="Touch help" delay={0}>
		{#snippet children(trigger)}<button {...trigger}>Hold for help</button>{/snippet}
	</Tooltip>
	<img src={resource.pathname} style="width: 32px; height: 32px;" />
	<input placeholder="Keyboard test" />
</div>

<style>
	.page { width: 100%; height: 100%; padding: 16px; gap: 10px; background-color: #151a24; color: white; font-size: 16px; }
	button { padding: 10px; background-color: #335ad9; color: white; }
	input { height: 40px; background-color: #243044; color: white; }
	:root { --ui-ink: white; --ui-muted: #aabbcc; --ui-accent: #88aaff; --ui-border-strong: #667788; --ui-raised: #243044; --ui-on-accent: white; }
</style>
