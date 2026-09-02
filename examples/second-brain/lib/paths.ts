import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DataDirs {
	root: string;
	db: string;
	files: string;
	thumbs: string;
	models: string;
	tmp: string;
}

let resources: string | null | undefined;

/**
 * A compiled .app keeps the ML worker, its dependencies and the recorder shim in
 * Contents/Resources; from a checkout there is no such directory and this is null.
 */
export function resources_dir(): string | null {
	if (resources !== undefined) return resources;
	const forced = process.env.GPUIX_BRAIN_RESOURCES;
	const candidate = forced || join(dirname(process.execPath), '..', 'Resources');
	resources = existsSync(join(candidate, 'ml', 'worker.js')) ? candidate : null;
	return resources;
}

function app_data_dir() {
	if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Substrate');
	if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Substrate');
	return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'substrate');
}

/** Inside the checkout's example directory, or the OS's application data directory for a compiled app. */
export const default_root = () => (resources_dir() ? app_data_dir() : fileURLToPath(new URL('../.data', import.meta.url)));

export function data_dirs(root: string = process.env.GPUIX_BRAIN_DIR || default_root()): DataDirs {
	const dirs: DataDirs = {
		root,
		db: join(root, 'substrate.sqlite'),
		files: join(root, 'files'),
		thumbs: join(root, 'thumbs'),
		models: join(root, 'models'),
		tmp: join(root, 'tmp')
	};
	for (const dir of [root, dirs.files, dirs.thumbs, dirs.models, dirs.tmp]) mkdirSync(dir, { recursive: true });

	// The database was called loam.sqlite before the rename.
	if (!existsSync(dirs.db) && existsSync(join(root, 'loam.sqlite'))) {
		for (const suffix of ['', '-wal', '-shm']) {
			const old = join(root, `loam.sqlite${suffix}`);
			if (existsSync(old)) renameSync(old, `${dirs.db}${suffix}`);
		}
	}
	return dirs;
}

export const file_path = (dirs: DataDirs, id: number | string, ext: string) => join(dirs.files, `${id}.${String(ext).replace(/^\./, '').toLowerCase()}`);
export const thumb_path = (dirs: DataDirs, id: number) => join(dirs.thumbs, `${id}.webp`);
