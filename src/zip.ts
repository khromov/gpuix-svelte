/**
 * The update archive is a zip, made and opened by adm-zip (no dependencies, node:zlib underneath)
 * on every platform, so neither the build nor the updater needs ditto, tar or unzip. This is the
 * thin layer around it: every entry's path is checked before it is written, Apple's `._` and
 * `__MACOSX` sidecars are skipped (left in, they would break a signed bundle's seal), modes are
 * kept but never group- or world-writable, and symlinks are refused at both ends (adm-zip would
 * write one as a file holding its target, which silently breaks what depends on it; a bundle
 * gpuix-svelte builds has none).
 */

import AdmZip from 'adm-zip';
import { chmodSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export class ZipError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'ZipError';
	}
}

/** Writes the archive's entries under `into` and returns how many; refuses any that would land outside it, and symlinks. */
export function extract_zip(zip_path: string, into: string): number {
	let zip: AdmZip;
	try {
		zip = new AdmZip(zip_path);
	} catch (error) {
		throw new ZipError(`not a zip file: ${(error as Error).message}`, { cause: error });
	}
	const root = resolve(into);
	let written = 0;
	for (const entry of zip.getEntries()) {
		const name = entry.entryName;
		const segments = name.split('/');
		if (segments[0] === '__MACOSX' || basename(name.replace(/\/$/, '')).startsWith('._')) continue;
		const bad = segments.some((segment, i) => (segment === '' && i < segments.length - 1) || segment === '..' || segment === '.');
		if (bad || name.startsWith('/') || /[\\:]/.test(name)) throw new ZipError(`${name} would land outside the directory`);
		const unix = entry.header.attr >>> 16;
		if ((unix & S_IFMT) === S_IFLNK) throw new ZipError(`${name} is a symlink, which an update archive cannot carry`);
		const destination = join(root, ...segments);
		// A directory entry handed to adm-zip takes every child with it, sidecars included.
		if (entry.isDirectory) {
			mkdirSync(destination, { recursive: true });
		} else {
			try {
				zip.extractEntryTo(entry, root, true, true, true);
			} catch (error) {
				throw new ZipError(`${name}: ${(error as Error).message}`, { cause: error });
			}
			// adm-zip writes an entry without unix modes as 0666; nothing an update carries should be writable by others.
			if (process.platform !== 'win32') chmodSync(destination, unix ? unix & 0o755 || 0o644 : 0o644);
		}
		written++;
	}
	return written;
}

/** `source` (a file, or a directory with everything under it, like `ditto --keepParent`) as a zip at `out`, modes kept. */
export function write_zip(source: string, out: string) {
	const path = resolve(source);
	refuse_symlinks(path);
	const zip = new AdmZip();
	if (lstatSync(path).isDirectory()) zip.addLocalFolder(path, basename(path));
	else zip.addLocalFile(path);
	zip.writeZip(out);
}

/** adm-zip follows symlinks and would quietly archive their targets (or nothing, for a dangling one). */
function refuse_symlinks(path: string) {
	const stat = lstatSync(path);
	if (stat.isSymbolicLink()) throw new ZipError(`${path} is a symlink, which an update archive cannot carry`);
	if (stat.isDirectory()) for (const child of readdirSync(path)) refuse_symlinks(join(path, child));
}
