function command() {
	if (process.platform === 'darwin') return ['defaults', 'read', '-g', 'AppleInterfaceStyle'];
	if (process.platform === 'linux') return ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'];
	if (process.platform === 'win32') {
		return ['reg', 'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'];
	}
	return null;
}

/**
 * @param {string} platform
 * @param {number} exitCode
 * @param {string} stdout
 * @returns {'dark' | 'light'}
 */
export function parse_appearance(platform, exitCode, stdout) {
	const out = (stdout ?? '').trim();
	// `defaults` exits 1 when the key is absent, which is what light mode looks like.
	if (platform === 'darwin') return exitCode === 0 && /dark/i.test(out) ? 'dark' : 'light';
	if (platform === 'linux') return /dark/i.test(out) ? 'dark' : 'light';
	if (platform === 'win32') return /REG_DWORD\s+0x0\b/.test(out) ? 'dark' : 'light';
	return 'dark';
}

const forced = () => {
	const mode = process.env.GPUIX_BRAIN_THEME;
	return mode === 'dark' || mode === 'light' ? mode : null;
};

/** Synchronous, for the first paint only. */
export function system_appearance() {
	const cmd = command();
	if (forced()) return forced();
	if (!cmd) return 'dark';
	try {
		const result = Bun.spawnSync(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
		return parse_appearance(process.platform, result.exitCode, result.stdout.toString());
	} catch {
		return 'dark';
	}
}

export async function system_appearance_async() {
	const cmd = command();
	if (forced()) return forced();
	if (!cmd) return 'dark';
	try {
		const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return parse_appearance(process.platform, code, stdout);
	} catch {
		return 'dark';
	}
}

/**
 * @param {(mode: 'dark' | 'light') => void} cb called on every change, and once at start
 * @param {number} [intervalMs]
 * @returns {() => void}
 */
export function watch_appearance(cb, intervalMs = 3000) {
	let last = null;
	const probe = async () => {
		const mode = await system_appearance_async();
		if (mode === last) return;
		last = mode;
		cb(mode);
	};
	probe();
	const timer = setInterval(probe, intervalMs);
	return () => clearInterval(timer);
}
