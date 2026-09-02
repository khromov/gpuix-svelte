<script>
	import { get_native } from 'gpuix-svelte';
	import { push, replace, route } from '../lib/router.svelte.js';
	import { focus, register, ui } from '../lib/ui.svelte.js';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	const KINDS = [
		{ word: 'note', hint: 'only notes' },
		{ word: 'link', hint: 'only links' },
		{ word: 'image', hint: 'only images' },
		{ word: 'audio', hint: 'only recordings' }
	];
	let value = $state(route.query.q ?? '');
	let focused = $state(false);
	let node = null;
	let timer = null;
	let blur_timer = null;

	// Leaving the search route clears the box; typing on any route opens it.
	$effect(() => {
		if (route.path !== '/search') value = '';
		else if (route.query.q !== undefined && route.query.q !== value) value = route.query.q;
	});

	function navigate(q) {
		const href = `/search?q=${encodeURIComponent(q)}`;
		if (route.path === '/search') replace(href);
		else push(href);
	}

	/** The last word decides: `k` offers `kind:`, `kind:` and `kind:im` offer the kinds. */
	function suggestions_for(text) {
		const at = text.lastIndexOf(' ');
		const token = text.slice(at + 1).toLowerCase();
		const head = text.slice(0, at + 1);
		if (!token) return [];
		// Completing `kind:` opens the kinds right away; completing a kind searches.
		const complete = (word, done) => () => {
			value = `${head}${word}${done ? ' ' : ''}`;
			if (done) navigate(value.trim());
			focus('search');
			show_suggestions();
		};
		const colon = token.indexOf(':');
		if (colon === -1) {
			return 'kind:'.startsWith(token) ? [{ label: 'kind:', hint: 'filter by kind — note, link, image or audio', apply: complete('kind:', false) }] : [];
		}
		const key = token.slice(0, colon);
		if (key !== 'kind' && key !== 'is' && key !== 'type') return [];
		const rest = token.slice(colon + 1);
		return KINDS.filter((k) => k.word.startsWith(rest) && k.word !== rest).map((k) => ({
			label: `${key}:${k.word}`,
			hint: k.hint,
			apply: complete(`${key}:${k.word}`, true)
		}));
	}

	function show_suggestions() {
		const items = focused ? suggestions_for(value) : [];
		if (!items.length || !node?.nativeId) {
			ui.suggest = null;
			return;
		}
		const bounds = get_native()?.getElementBounds(node.nativeId);
		if (!bounds) return;
		const [x, y, w, h] = bounds;
		ui.suggest = { items, active: 0, left: x - 12, top: y + h + 6, width: w + 24 };
	}

	function change(text) {
		value = text;
		show_suggestions();
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (value.trim()) navigate(value.trim());
		}, 200);
	}

	function submit(text) {
		clearTimeout(timer);
		value = text;
		ui.suggest = null;
		if (value.trim()) navigate(value.trim());
	}

	function clear() {
		clearTimeout(timer);
		value = '';
		ui.suggest = null;
		focus('root');
	}

	// Arrows move through the completions and Tab takes one; Enter still searches.
	function onkey(e) {
		if (e.key === 'escape') return ui.suggest ? (ui.suggest = null) : clear();
		const s = ui.suggest;
		if (!s) return;
		if (e.key === 'down') s.active = (s.active + 1) % s.items.length;
		else if (e.key === 'up') s.active = (s.active - 1 + s.items.length) % s.items.length;
		else if (e.key === 'tab') s.items[s.active]?.apply();
	}

	function onfocus() {
		clearTimeout(blur_timer);
		focused = true;
		show_suggestions();
	}

	// A click on a suggestion arrives after the input blurs; give it a beat.
	function onblur() {
		focused = false;
		blur_timer = setTimeout(() => {
			if (!focused) ui.suggest = null;
		}, 200);
	}
</script>

<div class="search" class:focused>
	<Icon name="search" size={15} tone="faint" />
	<input
		{@attach (n) => {
			node = n;
			register('search', n);
		}}
		{value}
		placeholder="Search your brain… (kind:note, kind:link, kind:image, kind:audio)"
		class="input"
		onchange={(e) => change(e.value)}
		onsubmit={(e) => submit(e.value)}
		onfocus={onfocus}
		onblur={onblur}
		onkeydown={onkey}
		testId="search-input"
	/>
	{#if value}
		<IconButton icon="x" size={22} onclick={clear} />
	{:else}
		<div class="hint">⌘K</div>
	{/if}
</div>

<style>
	.search { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-grow: 1; min-width: 0; padding: 6px 8px 6px 12px; border-radius: 8px; border-width: 1px; background-color: var(--surface); border-color: var(--border); color: var(--inkFaint); }
	.search.focused { border-color: var(--accent); background-color: var(--focusSurface); }
	.input { flex-grow: 1; min-width: 0; font-size: 13px; line-height: 18px; color: var(--ink); }
	.hint { padding: 1px 6px; border-radius: 4px; border-width: 1px; font-size: 10px; line-height: 14px; font-family: Lilex; pointer-events: none; user-select: none; border-color: var(--border); color: var(--inkFaint); }
</style>
