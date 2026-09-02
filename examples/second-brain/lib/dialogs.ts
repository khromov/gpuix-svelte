import { track } from './lifecycle.js';

const UTIS = {
	image: '{"public.image"}',
	audio: '{"public.audio", "public.movie"}',
	wav: '{"com.microsoft.waveform-audio"}'
};

const LINUX_FILTERS = {
	image: 'Images | *.png *.jpg *.jpeg *.gif *.webp *.bmp *.heic *.tiff',
	audio: 'Audio | *.wav *.mp3 *.m4a *.aac *.ogg *.opus *.flac *.aiff *.webm *.mp4',
	wav: 'WAV | *.wav'
};

export function picker_available() {
	if (process.platform === 'darwin') return { ok: true };
	if (process.platform === 'linux' && (Bun.which('zenity') || Bun.which('kdialog'))) return { ok: true };
	return { ok: false, reason: `no file picker on ${process.platform} — type a path instead` };
}

/**
 * @param {{ kinds?: 'image' | 'audio' | 'wav' | 'any', multiple?: boolean, prompt?: string }} [opts]
 * @returns {Promise<string[]>} empty on cancel
 */
export async function choose_files({ kinds = 'any', multiple = false, prompt = 'Add to Substrate' } = {}) {
	if (process.platform === 'darwin') return choose_mac({ kinds, multiple, prompt });
	if (process.platform === 'linux') return choose_linux({ kinds, multiple, prompt });
	throw new Error(picker_available().reason);
}

const escape_applescript = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** `as list` makes the single-selection alias and the multi-selection list read the same. */
async function choose_mac({ kinds, multiple, prompt }) {
	const types = UTIS[kinds] ? ` of type ${UTIS[kinds]}` : '';
	const selections = `${multiple ? 'with' : 'without'} multiple selections allowed`;
	const lines = [
		`set f to (choose file${types} with prompt "${escape_applescript(prompt)}" ${selections}) as list`,
		'set out to ""',
		'repeat with p in f',
		'set out to out & (POSIX path of p) & linefeed',
		'end repeat',
		'return out'
	];
	const { stdout, stderr, code } = await run(['osascript', ...lines.flatMap((line) => ['-e', line])]);
	if (code !== 0) {
		if (/-128/.test(stderr)) return [];
		throw new Error(stderr.trim() || `osascript exited ${code}`);
	}
	return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function choose_linux({ kinds, multiple, prompt }) {
	let cmd;
	if (Bun.which('zenity')) {
		cmd = ['zenity', '--file-selection', `--title=${prompt}`];
		if (multiple) cmd.push('--multiple', '--separator=\n');
		if (LINUX_FILTERS[kinds]) cmd.push(`--file-filter=${LINUX_FILTERS[kinds]}`);
	} else if (Bun.which('kdialog')) {
		cmd = ['kdialog', '--getopenfilename', ...(multiple ? ['--multiple', '--separate-output'] : []), '.', '--title', prompt];
	} else {
		throw new Error(picker_available().reason);
	}
	const { stdout, code } = await run(cmd);
	if (code !== 0) return [];
	return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function run(cmd) {
	const proc = track(Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }));
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	return { stdout, stderr, code };
}
