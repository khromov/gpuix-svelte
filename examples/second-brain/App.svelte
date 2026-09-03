<script lang="ts">
	import { on_window_key, set_css_vars, set_window_title, type GpuixEvent } from 'gpuix-svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { untrack } from 'svelte';
	import Sidebar from './components/Sidebar.svelte';
	import Toasts from './components/Toasts.svelte';
	import TopBar from './components/TopBar.svelte';
	import type { App } from './lib/app.ts';
	import { bind_app } from './lib/data.svelte.ts';
	import { back, push, route, type RouteEntry } from './lib/router.svelte.ts';
	import { bind_theme, start_system_poll, tokens } from './lib/theme.svelte.ts';
	import { focus, ui } from './lib/ui.svelte.ts';
	import RouteView from './RouteView.svelte';

	let { app }: { app: App } = $props();

	// Both are idempotent: the state modules outlive a hot remount, the app object too.
	untrack(() => {
		bind_app(app);
		bind_theme(app);
	});

	const ROUTES: RouteEntry[] = [
		{ path: '/', load: () => import('./routes/Everything.svelte'), title: 'Everything' },
		{ path: '/notes', load: () => import('./routes/Kind.svelte'), props: { kind: 'text' }, title: 'Notes' },
		{ path: '/links', load: () => import('./routes/Kind.svelte'), props: { kind: 'link' }, title: 'Links' },
		{ path: '/images', load: () => import('./routes/Kind.svelte'), props: { kind: 'image' }, title: 'Images' },
		{ path: '/audio', load: () => import('./routes/Kind.svelte'), props: { kind: 'audio' }, title: 'Audio' },
		{ path: '/feeds', load: () => import('./routes/Feeds.svelte'), title: 'Feeds' },
		{ path: '/search', load: () => import('./routes/Search.svelte'), title: 'Search' },
		{ path: '/item/:id', load: () => import('./routes/Item.svelte'), title: 'Item' },
		{ path: '/ask', load: () => import('./routes/Ask.svelte'), title: 'Ask' },
		{ path: '/settings', load: () => import('./routes/Settings.svelte'), title: 'Settings' },
		{ path: '*', load: () => import('./routes/NotFound.svelte'), title: 'Not found' }
	];

	$effect(() => start_system_poll());
	// The palette is the only theme: every `var(--…)` in a <style> below resolves against it.
	$effect(() => set_css_vars(tokens()));
	$effect(() => {
		set_window_title(ui.title === 'Everything' ? 'Substrate' : `Substrate — ${ui.title}`);
	});

	function onkey(e: GpuixEvent) {
		const cmd = e.modifiers?.cmd || e.modifiers?.ctrl;
		if (cmd && e.key === 'k') return focus('search');
		if (cmd && e.key === 'n') {
			if (route.path !== '/') push('/');
			setTimeout(() => focus('capture'), 30);
			return;
		}
		if (cmd && e.key === ',') return push('/settings');
		if (e.key === 'escape') {
			// An open dialog and a focused text field each get the same key and handle it themselves.
			if (ui.modals > 0 || e.editing) return;
			if (route.path !== '/') back();
		}
	}

	$effect(() => on_window_key('keydown', onkey));
</script>

<div class="root" testId="root">
	<Sidebar />
	<div class="main">
		<TopBar />
		<div class="page">
			<RouteView routes={ROUTES} />
		</div>
	</div>
	<Portal><Toasts /></Portal>
</div>

<style>
	.root { position: relative; display: flex; flex-direction: row; width: 100%; height: 100%; font-family: IBM Plex Sans; font-size: 13px; line-height: 20px; background-color: var(--bg); color: var(--ink); selection-color: var(--selection); }
	.main { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; min-height: 0; height: 100%; }
	.page { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
</style>
