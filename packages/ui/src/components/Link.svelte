<script lang="ts">
	import type { Snippet } from 'svelte';
	import { IS_GPUIX } from 'gpuix-svelte';
	import { key_of } from 'gpuix-svelte-ui/keys';
	import { navigate, resolve, router, to_url } from 'gpuix-svelte-ui/router';
	import { aria_current, own_hitbox, test_id } from 'gpuix-svelte-ui/shared';

	let {
		href,
		exact = false,
		replace = false,
		state = undefined,
		children,
		label = null,
		testid = null
	}: {
		href: string;
		/** Active only on this exact path; otherwise a screen below it counts too. `/` is always exact, and a query in `href` has to match as well. */
		exact?: boolean;
		replace?: boolean;
		state?: unknown;
		/** Gets `{ active }`, so the content can mark the current screen's link. */
		children: Snippet<[{ active: boolean }]>;
		label?: string | null;
		testid?: string | null;
	} = $props();

	type Click = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number; defaultPrevented?: boolean; preventDefault(): void };

	const external = $derived(/^([a-z][a-z\d+.-]*:|\/\/)/i.test(href));
	const target = $derived(resolve(href));
	const active = $derived.by(() => {
		if (external) return false;
		const path = target.path;
		const here = exact || path === '/' ? router.path === path : router.path === path || router.path.startsWith(`${path}/`);
		return here && Object.entries(target.query).every(([key, value]) => router.query[key] === value);
	});

	let warned = false;

	// A modified or non-primary click in a browser stays the browser's (a new tab); GPUI reports neither here.
	function click(e: Click) {
		if (e.defaultPrevented) return;
		if (external) {
			// A page's <a> follows it; a window has nothing to open it with.
			if (IS_GPUIX && !warned) {
				warned = true;
				console.warn(`[gpuix-svelte-ui] a Link cannot open ${href} in a window`);
			}
			return;
		}
		if (!IS_GPUIX && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button ?? 0) !== 0)) return;
		e.preventDefault();
		navigate(href, { replace, state }).catch((error: unknown) => console.error(`[gpuix-svelte-ui] a Link could not navigate to ${href}`, error));
	}

	// A real <a href> is a link only where the URL means something: in history and hash mode, or off to another
	// site. A GPUI box, and a page in memory mode, need the role, the tab stop and Enter by hand instead, or a
	// middle click would open a 404. `router.mode` is read here directly, so a mode change re-derives the href and not only the tag.
	const anchor = $derived(!IS_GPUIX && (external || router.mode !== 'memory'));
	const extra = $derived.by(() => {
		if (!anchor) {
			return {
				role: 'link',
				tabindex: 0,
				onkeydown: (e: Click & { key?: string }) => {
					if (key_of(e) === 'enter') click(e);
				}
			};
		}
		return { href: external ? href : to_url(href) };
	});
	// Typed as the GPUI tag: that namespace knows no <a>, while the DOM typecheck takes any tag.
	const tag = $derived((anchor ? 'a' : 'div') as 'div');
</script>

<svelte:element this={tag} class="link" class:active aria-label={label} {...own_hitbox} {...aria_current(active)} {...extra} {...test_id(testid)} onclick={click}>
	{@render children({ active })}
</svelte:element>

<style>
	.link {
		display: flex;
		align-items: center;
		cursor: pointer;
		user-select: none;
		text-decoration: none;
		color: var(--ui-ink);
	}
	.link:hover {
		color: var(--ui-accent-ink);
	}
	.link:focus-visible {
		outline-width: 2px;
		outline-offset: 2px;
		outline-style: solid;
		outline-color: var(--ui-ink);
	}
	.link.active {
		color: var(--ui-accent-ink);
	}
</style>
