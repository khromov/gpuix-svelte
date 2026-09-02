export type Appearance = 'dark' | 'light';

function command(): string[] | null {
	if (process.platform === 'darwin') return ['defaults', 'read', '-g', 'AppleInterfaceStyle'];
	if (process.platform === 'linux') return ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'];
	if (process.platform === 'win32') {
		return ['reg', 'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'];
	}
	return null;
}

export function parse_appearance(platform: string, exitCode: number, stdout: string): Appearance {
	const out = (stdout ?? '').trim();
	// `defaults` exits 1 when the key is absent, which is what light mode looks like.
	if (platform === 'darwin') return exitCode === 0 && /dark/i.test(out) ? 'dark' : 'light';
	if (platform === 'linux') return /dark/i.test(out) ? 'dark' : 'light';
	if (platform === 'win32') return /REG_DWORD\s+0x0\b/.test(out) ? 'dark' : 'light';
	return 'dark';
}

export const forced = (): Appearance | null => {
	const mode = process.env.GPUIX_BRAIN_THEME;
	return mode === 'dark' || mode === 'light' ? mode : null;
};

/** Synchronous, for the first paint only. */
export function system_appearance(): Appearance {
	const cmd = command();
	if (forced()) return forced()!;
	if (!cmd) return 'dark';
	try {
		const result = Bun.spawnSync(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
		return parse_appearance(process.platform, result.exitCode, result.stdout.toString());
	} catch {
		return 'dark';
	}
}

export async function system_appearance_async(): Promise<Appearance> {
	const cmd = command();
	if (forced()) return forced()!;
	if (!cmd) return 'dark';
	try {
		const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return parse_appearance(process.platform, code, stdout);
	} catch {
		return 'dark';
	}
}

/** `cb` runs on every change, and once at start. */
export function watch_appearance(cb: (mode: Appearance) => void, intervalMs = 3000): () => void {
	let last: Appearance | null = null;
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
