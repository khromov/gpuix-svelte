<script lang="ts">
	import type { Snippet } from 'svelte';
	import { IS_GPUIX } from 'gpuix-svelte';
	import { activates } from 'gpuix-svelte-ui/keys';
	import { link_href, navigate, router } from 'gpuix-svelte-ui/router';
	import { own_hitbox, test_id } from 'gpuix-svelte-ui/shared';

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
		/** Active only on this exact path; otherwise a screen below it counts too. `/` is always exact. */
		exact?: boolean;
		replace?: boolean;
		state?: unknown;
		/** Gets `{ active }`, so the content can mark the current screen's link. */
		children: Snippet<[{ active: boolean }]>;
		label?: string | null;
		testid?: string | null;
	} = $props();

	type Click = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number; preventDefault(): void };

	const target = $derived(href.split('?')[0]);
	const active = $derived(exact || target === '/' ? router.path === target : router.path === target || router.path.startsWith(`${target}/`));

	// A modified or non-primary click in a browser stays the browser's (a new tab); GPUI reports neither here.
	function click(e: Click) {
		if (!IS_GPUIX && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button ?? 0) !== 0)) return;
		e.preventDefault();
		navigate(href, { replace, state });
	}

	// A real <a> is focusable and Enter clicks it; a GPUI box needs both by hand, and `href` only means something to a page.
	const extra = $derived(IS_GPUIX ? { role: 'link', tabindex: 0, onkeydown: (e: Click & { key?: string }) => activates(e) && click(e) } : { href: link_href(router.mode === 'hash' ? href : href) });
	// Typed as the GPUI tag: that namespace knows no <a>, while the DOM typecheck takes any tag.
	const tag = (IS_GPUIX ? 'div' : 'a') as 'div';
</script>

<svelte:element this={tag} class="link" class:active aria-label={label} {...own_hitbox} {...extra} {...test_id(testid)} onclick={click}>
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
		outline-color: var(--ui-ink);
	}
	.link.active {
		color: var(--ui-accent-ink);
	}
</style>
