export type { EmbeddedAppInfo, UpdateFragment } from './app-bundle.ts';
import type { CheckOptions, UpdateErrorCode } from './update.ts';

export type {
	CheckOptions,
	DownloadOptions,
	InstallOptions,
	ManifestOptions,
	NotInstallable,
	Update,
	UpdateAsset,
	UpdateErrorCode,
	UpdateManifest
} from './update.ts';
export class UpdateError extends Error {
	code: UpdateErrorCode;
	constructor(code: UpdateErrorCode, message: string) {
		super(message);
		this.name = 'UpdateError';
		this.code = code;
	}
}

const unavailable = () => new Error('[gpuix-svelte] self-updating apps are not supported by the txiki.js runtime');

export function app_info(): null {
	return null;
}

export function check_for_update(_options?: CheckOptions): Promise<null> {
	void _options;
	return Promise.reject(unavailable());
}

export function finish_update(_target?: string): never {
	void _target;
	throw unavailable();
}

export function generate_keys(..._args: unknown[]): never { void _args; throw unavailable(); }
export function sign_manifest(..._args: unknown[]): never { void _args; throw unavailable(); }
export function verify_manifest(..._args: unknown[]): never { void _args; throw unavailable(); }
export function build_manifest(..._args: unknown[]): never { void _args; throw unavailable(); }
export function plist_strings(..._args: unknown[]): never { void _args; throw unavailable(); }
export function canonical_manifest(..._args: unknown[]): never { void _args; throw unavailable(); }
export function compare_versions(..._args: unknown[]): never { void _args; throw unavailable(); }
export function is_public_key(..._args: unknown[]): never { void _args; throw unavailable(); }
export function is_version(..._args: unknown[]): never { void _args; throw unavailable(); }
