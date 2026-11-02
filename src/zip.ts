/**
 * The update archive is a zip, made and opened by adm-zip (no dependencies, node:zlib underneath)
 * on every platform, so neither the build nor the updater needs ditto, tar or unzip. This is the
 * thin layer around it: every entry's path is checked before anything is written, Apple's `._` and
 * `__MACOSX` sidecars are skipped (left in, they would break a signed bundle's seal), and modes
 * are kept. A symlink entry comes out as a file holding its target, which a bundle gpuix-svelte
 * builds never contains.
 */

import AdmZip from 'adm-zip';
import { lstatSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export class ZipError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'ZipError';
	}
}

/** Writes the archive's entries under `into` and returns how many; refuses any that would land outside it. */
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
		// A directory entry handed to adm-zip takes every child with it, sidecars included.
		if (entry.isDirectory) {
			mkdirSync(join(root, ...segments), { recursive: true });
		} else {
			try {
				zip.extractEntryTo(entry, root, true, true, true);
			} catch (error) {
				throw new ZipError(`${name}: ${(error as Error).message}`, { cause: error });
			}
		}
		written++;
	}
	return written;
}

/** `source` (a file, or a directory with everything under it, like `ditto --keepParent`) as a zip at `out`, modes kept. */
export function write_zip(source: string, out: string) {
	const zip = new AdmZip();
	const path = resolve(source);
	if (lstatSync(path).isDirectory()) zip.addLocalFolder(path, basename(path));
	else zip.addLocalFile(path);
	zip.writeZip(out);
}
