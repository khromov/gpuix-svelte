import type { Option } from 'gpuix-svelte-ui';

export interface Deployment {
	id: number;
	message: string;
	branch: string;
	author: string;
	status: 'ready' | 'building' | 'failed';
	age: string;
}

export const DEPLOYMENTS: Deployment[] = [
	{ id: 128, message: 'Cache the font files for a year', branch: 'main', author: 'Ada Lovelace', status: 'building', age: 'just now' },
	{ id: 127, message: 'Move the pricing table into a card', branch: 'pricing', author: 'Grace Hopper', status: 'ready', age: '12 min ago' },
	{ id: 126, message: 'Fix the dark logo in Safari', branch: 'main', author: 'Alan Turing', status: 'failed', age: '1 h ago' },
	{ id: 125, message: 'Add the changelog page', branch: 'main', author: 'Ada Lovelace', status: 'ready', age: '3 h ago' },
	{ id: 124, message: 'Bump the toolkit', branch: 'deps', author: 'Katherine Johnson', status: 'ready', age: 'yesterday' }
];

export const MEMBERS = [
	{ name: 'Ada Lovelace', email: 'ada@orbit.app', role: 'Owner' },
	{ name: 'Grace Hopper', email: 'grace@orbit.app', role: 'Admin' },
	{ name: 'Alan Turing', email: 'alan@orbit.app', role: 'Developer' },
	{ name: 'Katherine Johnson', email: 'katherine@orbit.app', role: 'Developer' }
];

export const REGIONS: Option[] = [
	{ value: 'fra', label: 'Frankfurt', description: 'eu-central' },
	{ value: 'iad', label: 'Washington, D.C.', description: 'us-east' },
	{ value: 'sin', label: 'Singapore', description: 'ap-southeast' }
];

const DEFAULTS = {
	name: 'orbit-web',
	region: 'fra' as string | null,
	description: 'The marketing site and the docs.',
	auto_deploy: true,
	previews: true,
	notify: true,
	node: '24',
	builds: 3
};

// Module state, since the Router mounts each screen fresh and the edits should outlive a visit elsewhere.
export const settings = $state({ ...DEFAULTS });
let saved = { ...DEFAULTS };

export function save() {
	saved = $state.snapshot(settings);
}

export function discard() {
	Object.assign(settings, saved);
}
