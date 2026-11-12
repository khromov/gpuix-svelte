import { getContext, setContext } from 'svelte';
import type { DismissLayer, DismissScope } from './types.ts';

const SCOPE = Symbol('gpuix-svelte.dismiss-scope');

/**
 * Called while a component initialises: its overlay's place among the layers mounted inside it. Svelte runs a
 * child's effects before its parent's, so two layers opened in one commit push the outer one last without it.
 */
export function dismiss_scope(): DismissScope {
	const scope: DismissScope = { parent: getContext<DismissScope | undefined>(SCOPE) ?? null };
	setContext(SCOPE, scope);
	return scope;
}

function inside(scope: DismissScope | undefined, outer: DismissScope) {
	for (let s = scope?.parent ?? null; s; s = s.parent) if (s === outer) return true;
	return false;
}

/** Puts a layer on top, or under the first open layer mounted inside it, as upstream's `pushDismissLayer` does with `parent`. */
export function place_layer(layers: DismissLayer[], entry: DismissLayer) {
	const scope = entry.scope;
	const below = scope ? layers.findIndex((layer) => inside(layer.scope, scope)) : -1;
	if (below === -1) layers.push(entry);
	else layers.splice(below, 0, entry);
}
