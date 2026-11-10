/**
 * What a playground component may import, per renderer. scripts/playground.ts builds each entry
 * to its own file beside the frame, and compile.ts points the compiled code's imports at them, so
 * the frame and the code it runs share one Svelte runtime and one renderer.
 */

export type Target = 'gpui' | 'dom';

export interface PlaygroundModule {
	specifier: string;
	default?: boolean;
}

const SHARED: PlaygroundModule[] = [
	{ specifier: 'svelte' },
	{ specifier: 'svelte/internal/client' },
	{ specifier: 'svelte/internal/disclose-version' },
	{ specifier: 'svelte/reactivity' },
	{ specifier: 'svelte/store' },
	{ specifier: 'svelte/motion' },
	{ specifier: 'svelte/easing' },
	{ specifier: 'svelte/attachments' },
	{ specifier: 'gpuix-svelte' },
	...['Scroller', 'Portal', 'Tooltip', 'Popover'].map((name) => ({ specifier: `gpuix-svelte/components/${name}.svelte`, default: true }))
];

export const MODULES: Record<Target, PlaygroundModule[]> = {
	gpui: [
		...SHARED,
		{ specifier: 'gpuix-svelte/renderer', default: true },
		{ specifier: 'svelte/internal/flags/custom-renderer' },
		{ specifier: 'svelte/internal/flags/async' }
	],
	dom: [
		...SHARED,
		{ specifier: 'svelte/internal/init-operations' },
		{ specifier: 'svelte/transition' },
		{ specifier: 'svelte/animate' },
		{ specifier: 'svelte/events' }
	]
};

export const file_of = (specifier: string) => `${specifier.replace(/[^a-z0-9]+/gi, '-')}.js`;
