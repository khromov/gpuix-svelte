import { normalize_base_url } from './llm.js';

export const SETTINGS = {
	'llm.baseUrl': { default: '', env: 'GPUIX_BRAIN_LLM_URL' },
	'llm.apiKey': { default: '', env: 'GPUIX_BRAIN_LLM_KEY', secret: true },
	'llm.model': { default: '', env: 'GPUIX_BRAIN_LLM_MODEL' },
	'llm.visionModel': { default: '' },
	'theme.mode': { default: 'system' },
	'stt.language': { default: '' },
	'ml.autoload': { default: true },
	'index.embedModel': { default: null, internal: true }
};

const mask = (value) => (value ? `${'•'.repeat(Math.min(12, String(value).length - 4))}${String(value).slice(-4)}` : '');

/**
 * @param {import('./store.js').Item extends infer _ ? ReturnType<typeof import('./store.js').create_store> : never} store
 * @param {ReturnType<typeof import('./bus.js').create_bus>} bus
 */
export function create_settings(store, bus) {
	const from_env = (key) => {
		const env = SETTINGS[key]?.env;
		return env ? process.env[env] || null : null;
	};

	const settings = {
		/** env override > stored > default */
		get(key) {
			const env = from_env(key);
			if (env !== null) return env;
			const stored = store.get_setting(key);
			return stored === undefined ? SETTINGS[key]?.default : stored;
		},

		set(key, value) {
			store.set_setting(key, value);
			bus.emit({ type: 'settings', key, value });
		},

		from_env: (key) => from_env(key) !== null,

		/** @param {{ reveal?: boolean }} [opts] */
		all({ reveal = false } = {}) {
			const out = {};
			for (const key of Object.keys(SETTINGS)) {
				const value = settings.get(key);
				out[key] = SETTINGS[key].secret && !reveal ? mask(value) : value;
			}
			return out;
		},

		/** @returns {import('./llm.js').LlmConfig | null} */
		llm_config() {
			const baseUrl = settings.get('llm.baseUrl');
			const model = settings.get('llm.model');
			if (!baseUrl || !model) return null;
			return { baseUrl: normalize_base_url(baseUrl), apiKey: settings.get('llm.apiKey') ?? '', model };
		},

		/** @returns {import('./llm.js').LlmConfig | null} */
		vision_config() {
			const base = settings.llm_config();
			const model = settings.get('llm.visionModel');
			return base && model ? { ...base, model } : null;
		}
	};

	return settings;
}
