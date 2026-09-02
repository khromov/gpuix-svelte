import { ffmpeg_available } from './audio.js';
import { clipboard_available } from './clipboard.js';
import { picker_available } from './dialogs.js';
import { llm_available } from './llm.js';
import { player_available } from './player.js';
import { init_recorder, recorder_available } from './recorder.js';

/** @typedef {{ ok: boolean, reason?: string }} Cap */

/**
 * @param {{ llmConfig?: import('./llm.js').LlmConfig | null }} [opts]
 * @returns {Promise<{ platform: string, recorder: Cap, ffmpeg: Cap, clipboardImage: Cap, clipboardText: Cap,
 *   filePicker: Cap, player: Cap, llm: Cap }>}
 */
export async function capabilities({ llmConfig = null } = {}) {
	await init_recorder();
	const clipboard = clipboard_available();
	return {
		platform: process.platform,
		recorder: recorder_available(),
		ffmpeg: ffmpeg_available(),
		clipboardImage: clipboard.image,
		clipboardText: clipboard.text,
		filePicker: picker_available(),
		player: player_available(),
		llm: llm_available(llmConfig)
	};
}
