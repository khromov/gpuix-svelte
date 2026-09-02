<script>
	import { get_native } from 'gpuix-svelte';
	import { untrack } from 'svelte';
	import Modal from './components/Modal.svelte';
	import Sidebar from './components/Sidebar.svelte';
	import Toasts from './components/Toasts.svelte';
	import TopBar from './components/TopBar.svelte';
	import { bind_app } from './lib/data.svelte.js';
	import { back, push, route } from './lib/router.svelte.js';
	import { bind_theme, resolved, start_system_poll } from './lib/theme.svelte.js';
	import { close_modal, focus, register, ui } from './lib/ui.svelte.js';
	import RouteView from './RouteView.svelte';

	let { app } = $props();

	// Both are idempotent: the state modules outlive a hot remount, the app object too.
	untrack(() => {
		bind_app(app);
		bind_theme(app);
	});

	const ROUTES = [
		{ path: '/', load: () => import('./routes/Everything.svelte'), title: 'Everything' },
		{ path: '/notes', load: () => import('./routes/Kind.svelte'), props: { kind: 'text' }, title: 'Notes' },
		{ path: '/links', load: () => import('./routes/Kind.svelte'), props: { kind: 'link' }, title: 'Links' },
		{ path: '/images', load: () => import('./routes/Kind.svelte'), props: { kind: 'image' }, title: 'Images' },
		{ path: '/audio', load: () => import('./routes/Kind.svelte'), props: { kind: 'audio' }, title: 'Audio' },
		{ path: '/search', load: () => import('./routes/Search.svelte'), title: 'Search' },
		{ path: '/item/:id', load: () => import('./routes/Item.svelte'), title: 'Item' },
		{ path: '/ask', load: () => import('./routes/Ask.svelte'), title: 'Ask' },
		{ path: '/settings', load: () => import('./routes/Settings.svelte'), title: 'Settings' },
		{ path: '*', load: () => import('./routes/NotFound.svelte'), title: 'Not found' }
	];

	const mode = $derived(resolved());

	$effect(() => start_system_poll());
	// The headless test renderer has no window to title.
	$effect(() => {
		get_native()?.setWindowTitle?.(ui.title === 'Everything' ? 'Substrate' : `Substrate — ${ui.title}`);
	});

	function onkey(e) {
		const cmd = e.modifiers?.cmd || e.modifiers?.ctrl;
		if (cmd && e.key === 'k') return focus('search');
		if (cmd && e.key === 'n') {
			if (route.path !== '/') push('/');
			setTimeout(() => focus('capture'), 30);
			return;
		}
		if (cmd && e.key === ',') return push('/settings');
		if (e.key === 'escape') {
			if (ui.modal) return close_modal(false);
			if (route.path !== '/') back();
		}
	}
</script>

<div {@attach (node) => register('root', node)} autofocus tabindex="0" onkeydown={onkey} class="root {mode}" testId="root">
	<Sidebar />
	<div class="main">
		<TopBar />
		<div class="page">
			<RouteView routes={ROUTES} />
		</div>
	</div>
	<Toasts />
	<Modal />
</div>

<style>
	.root { position: relative; display: flex; flex-direction: row; width: 100%; height: 100%; font-family: IBM Plex Sans; font-size: 13px; line-height: 20px; }
	.root.light { background-color: #f5efe4; color: #2a251f; selection-color: rgba(95, 122, 74, 0.28); }
	.root.dark { background-color: #1b1815; color: #ece3d3; selection-color: rgba(143, 174, 116, 0.32); }
	.main { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; min-height: 0; height: 100%; }
	.page { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
</style>
