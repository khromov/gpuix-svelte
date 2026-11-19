import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type AndroidAbi = 'arm64-v8a' | 'x86_64' | 'armeabi-v7a';

export interface MobileConfig {
	entry: string;
	name: string;
	appId: string;
	ios: { deploymentTarget: string; teamId?: string };
	android: { abis: AndroidAbi[]; compileSdk: number; minSdk: number; targetSdk: number; ndkVersion: string };
}

export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
	entry: 'app.ts',
	name: 'My App',
	appId: 'dev.example.myapp',
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

export function read_mobile_config(root = process.cwd()): MobileConfig {
	const path = resolve(root, 'gpuix.mobile.json');
	let value: unknown;
	try { value = JSON.parse(readFileSync(path, 'utf8')); }
	catch (error) { fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`); }
	return validate_mobile_config(value);
}
