import type { Bus } from './bus.ts';
import { normalize_base_url, type LlmConfig } from './llm.ts';
import { DEFAULT_SCHEDULE } from './feeds/schedules.ts';
import type { Store } from './store.ts';

export interface SettingValues {
	'llm.baseUrl': string;
	'llm.apiKey': string;
	'llm.model': string;
	'llm.visionModel': string;
	'theme.mode': 'system' | 'light' | 'dark';
	'stt.language': string;
	'ml.autoload': boolean;
	'index.embedModel': string | null;
	'search.includeFeeds': boolean;
	'feeds.schedule': string;
}

export type SettingKey = keyof SettingValues;

interface SettingSpec {
	default: string | boolean | null;
	env?: string;
	secret?: boolean;
	internal?: boolean;
}

export type Settings = ReturnType<typeof create_settings>;

export const SETTINGS: Record<SettingKey, SettingSpec> = {
	'llm.baseUrl': { default: '', env: 'GPUIX_BRAIN_LLM_URL' },
	'llm.apiKey': { default: '', env: 'GPUIX_BRAIN_LLM_KEY', secret: true },
	'llm.model': { default: '', env: 'GPUIX_BRAIN_LLM_MODEL' },
	'llm.visionModel': { default: '' },
	'theme.mode': { default: 'system' },
	'stt.language': { default: '' },
	'ml.autoload': { default: true },
	'index.embedModel': { default: null, internal: true },
	'search.includeFeeds': { default: false },
	'feeds.schedule': { default: DEFAULT_SCHEDULE }
};

const mask = (value: unknown) => (value ? `${'•'.repeat(Math.max(0, Math.min(12, String(value).length - 4)))}${String(value).slice(-4)}` : '');

export function create_settings(store: Store, bus: Bus) {
	const from_env = (key: SettingKey) => {
		const env = SETTINGS[key]?.env;
		return env ? process.env[env] || null : null;
	};

	const settings = {
		/** env override > stored > default */
		get<K extends SettingKey>(key: K): SettingValues[K] {
			const env = from_env(key);
			if (env !== null) return env as SettingValues[K];
			const stored = store.get_setting(key);
			return (stored === undefined ? SETTINGS[key]?.default : stored) as SettingValues[K];
		},

		set(key: SettingKey, value: unknown) {
			store.set_setting(key, value);
			bus.emit({ type: 'settings', key, value });
		},

		from_env: (key: SettingKey) => from_env(key) !== null,

		all({ reveal = false }: { reveal?: boolean } = {}): Record<SettingKey, unknown> {
			const out = {} as Record<SettingKey, unknown>;
			for (const key of Object.keys(SETTINGS) as SettingKey[]) {
				const value = settings.get(key);
				out[key] = SETTINGS[key].secret && !reveal ? mask(value) : value;
			}
			return out;
		},

		llm_config(): LlmConfig | null {
			const baseUrl = settings.get('llm.baseUrl');
			const model = settings.get('llm.model');
			if (!baseUrl || !model) return null;
			return { baseUrl: normalize_base_url(baseUrl), apiKey: settings.get('llm.apiKey') ?? '', model };
		},

		vision_config(): LlmConfig | null {
			const base = settings.llm_config();
			const model = settings.get('llm.visionModel');
			return base && model ? { ...base, model } : null;
		}
	};

	return settings;
}
