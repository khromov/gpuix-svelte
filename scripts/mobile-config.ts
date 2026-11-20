import { existsSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { nearest_package, read_entry_app, resolve_app_info, type EntryApp } from '../src/app-bundle.ts';
import type { AndroidAbi } from '../src/types.ts';

export type { AndroidAbi };

export interface MobileConfig {
	entry: string;
	name: string;
	appId: string;
	version?: string;
	buildNumber?: number;
	icon?: string;
	assets?: string[];
	ios: { deploymentTarget: string; teamId?: string };
	android: { abis: AndroidAbi[]; compileSdk: number; minSdk: number; targetSdk: number; ndkVersion: string };
}

export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
	entry: 'app.ts',
	name: 'My App',
	appId: 'dev.example.myapp',
	version: '0.1.0',
	buildNumber: 1,
	ios: { deploymentTarget: '16.0' },
	android: { abis: ['arm64-v8a'], compileSdk: 36, minSdk: 26, targetSdk: 36, ndkVersion: '29.0.14206865' }
};

const fail = (message: string): never => { throw new Error(`[mobile] ${message}`); };

export function validate_mobile_config(value: unknown): MobileConfig {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail('config must be a JSON object');
	const config = value as Partial<MobileConfig>;
	const str = (v: unknown, label: string) => typeof v === 'string' && v.trim() ? v : fail(`${label} must be a non-empty string`);
	const positive = (v: unknown, label: string) => Number.isInteger(v) && (v as number) > 0 ? v as number : fail(`${label} must be a positive integer`);
	str(config.entry, 'entry');
	const name = str(config.name, 'name');
	if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(name)) fail('name may contain letters, numbers, spaces, dots, underscores and hyphens');
	const appId = str(config.appId, 'appId');
	if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appId)) fail('appId must be a reverse-domain identifier, such as dev.example.app');
	if (config.version !== undefined && !/^\d+\.\d+\.\d+$/.test(str(config.version, 'version'))) fail('version must have three numeric components');
	if (config.buildNumber !== undefined && positive(config.buildNumber, 'buildNumber') > 2100000000) fail('buildNumber must not exceed 2100000000');
	if (config.icon !== undefined) str(config.icon, 'icon');
	if (config.assets !== undefined && (!Array.isArray(config.assets) || config.assets.some(path => typeof path !== 'string' || !path || path.startsWith('/') || path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')))) fail('assets must be relative file or directory paths within the project');
	if (!config.ios || typeof config.ios !== 'object') fail('ios settings are required');
	const ios = config.ios as MobileConfig['ios'];
	if (!/^\d+\.\d+$/.test(str(ios.deploymentTarget, 'ios.deploymentTarget'))) fail('ios.deploymentTarget must be a version such as 16.0');
	if (ios.teamId !== undefined && !/^[A-Z0-9]{10}$/.test(ios.teamId)) fail('ios.teamId must be a 10-character Apple team ID');
	if (!config.android || typeof config.android !== 'object') fail('android settings are required');
	const android = config.android as MobileConfig['android'];
	if (!Array.isArray(android.abis) || !android.abis.length || android.abis.some((abi) => !['arm64-v8a', 'x86_64', 'armeabi-v7a'].includes(abi))) fail('android.abis must contain supported Android ABI names');
	positive(android.compileSdk, 'android.compileSdk'); positive(android.minSdk, 'android.minSdk'); positive(android.targetSdk, 'android.targetSdk');
	str(android.ndkVersion, 'android.ndkVersion');
	if (android.minSdk > android.targetSdk) fail('android.minSdk cannot exceed android.targetSdk');
	return config as MobileConfig;
}

export function find_entry(root: string, explicit_entry?: string): string {
	if (explicit_entry) return resolve(root, explicit_entry);
	const candidates = ['app.ts', 'main.ts', 'src/app.ts', 'src/main.ts', 'standalone.ts', 'src/standalone.ts'];
	for (const candidate of candidates) {
		const full = resolve(root, candidate);
		if (existsSync(full)) return full;
	}
	return resolve(root, 'app.ts');
}

export function read_mobile_config(explicit_entry?: string, root = process.cwd()): MobileConfig {
	const entry_path = find_entry(root, explicit_entry);
	if (existsSync(entry_path)) {
		let declared: EntryApp;
		try {
			declared = read_entry_app(entry_path);
		} catch (error) {
			return fail(`cannot read entry app options from ${entry_path}: ${error instanceof Error ? error.message : String(error)}`);
		}
		const app = resolve_app_info(declared, entry_path);
		const rel_entry = relative(root, entry_path) || basename(entry_path);
		const raw_id = declared.identifier || (declared as { appId?: string }).appId;
		const appId = raw_id || (app.identifier.includes('-') ? `dev.example.${app.slug.replace(/[^a-zA-Z0-9_]/g, '') || 'myapp'}` : app.identifier);
		const config: MobileConfig = {
			entry: rel_entry,
			name: app.name,
			appId,
			version: app.version,
			buildNumber: app.buildNumber ?? 1,
			...(declared.icon && { icon: relative(root, app.icon) }),
			...(app.assets && { assets: app.assets }),
			ios: {
				deploymentTarget: app.ios?.deploymentTarget ?? DEFAULT_MOBILE_CONFIG.ios.deploymentTarget,
				...(app.ios?.teamId && { teamId: app.ios.teamId })
			},
			android: {
				abis: app.android?.abis ?? DEFAULT_MOBILE_CONFIG.android.abis,
				compileSdk: app.android?.compileSdk ?? DEFAULT_MOBILE_CONFIG.android.compileSdk,
				minSdk: app.android?.minSdk ?? DEFAULT_MOBILE_CONFIG.android.minSdk,
				targetSdk: app.android?.targetSdk ?? DEFAULT_MOBILE_CONFIG.android.targetSdk,
				ndkVersion: app.android?.ndkVersion ?? DEFAULT_MOBILE_CONFIG.android.ndkVersion
			}
		};
		return validate_mobile_config(config);
	}

	const rel_entry = relative(root, entry_path) || basename(entry_path);
	const pkg = nearest_package(root);
	const name = pkg?.name || DEFAULT_MOBILE_CONFIG.name;
	const config: MobileConfig = {
		entry: rel_entry,
		name,
		appId: DEFAULT_MOBILE_CONFIG.appId,
		version: pkg?.version || DEFAULT_MOBILE_CONFIG.version,
		buildNumber: 1,
		ios: structuredClone(DEFAULT_MOBILE_CONFIG.ios),
		android: structuredClone(DEFAULT_MOBILE_CONFIG.android)
	};
	return validate_mobile_config(config);
}
