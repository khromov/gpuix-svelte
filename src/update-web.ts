/**
 * `gpuix-svelte/update` under the `browser` condition: a page has no executable to replace, and
 * node:crypto's browser shim lacks the key functions, so a web bundle gets a check that says
 * "nothing to update" and keeps the same types.
 */

import type { CheckOptions, Update } from './update.ts';

export type {
	CheckOptions,
	DownloadOptions,
	EmbeddedAppInfo,
	InstallOptions,
	NotInstallable,
	Update,
	UpdateAsset,
	UpdateErrorCode,
	UpdateFragment,
	UpdateManifest
} from './update.ts';

export class UpdateError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = 'UpdateError';
		this.code = code;
	}
}

export function app_info(): null {
	return null;
}

export async function check_for_update(_options: CheckOptions = {}): Promise<Update | null> {
	void _options;
	return null;
}

export function finish_update() {}
