/**
 * A zip reader and writer over node:zlib, so an update archive is made and opened by the same code
 * on every platform, with no ditto, tar.exe or unzip to depend on. It keeps what an `.app` needs
 * (unix modes, symlinks that stay inside the tree) and reads what ditto and bsdtar write. Whole
 * files are held in memory: an app is a couple of hundred megabytes at most, and this runs once.
 */

import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
	/** Forward slashes; a directory ends in `/`. */
	name: string;
	kind: 'file' | 'dir' | 'symlink';
	/** The unix permission bits when the archive carries them (ditto, bsdtar, this writer), else null. */
	mode: number | null;
	size: number;
	/** The file's bytes, or a symlink's target; inflated and CRC-checked on first call. */
	bytes(): Buffer;
}

export interface ZipInput {
	name: string;
	data?: Buffer | string;
	/** Permission bits; a directory is `name` ending in `/`, a symlink has `target`. */
	mode?: number;
	target?: string;
	mtime?: Date;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const UNIX = 3;
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

export class ZipError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipError';
	}
}

/** The entries of a zip held in memory, from its central directory. */
export function read_zip(zip: Buffer): ZipEntry[] {
	const eocd = find_eocd(zip);
	let count = zip.readUInt16LE(eocd + 10);
	let cd_offset = zip.readUInt32LE(eocd + 16);
	if (count === 0xffff || cd_offset === 0xffffffff) {
		// zip64: the locator sits just before the end record and points at the 64-bit one.
		const locator = eocd - 20;
		if (locator < 0 || zip.readUInt32LE(locator) !== EOCD64_LOCATOR) throw new ZipError('zip64 archive without a locator');
		const eocd64 = Number(zip.readBigUInt64LE(locator + 8));
		if (zip.readUInt32LE(eocd64) !== EOCD64) throw new ZipError('bad zip64 end record');
		count = Number(zip.readBigUInt64LE(eocd64 + 32));
		cd_offset = Number(zip.readBigUInt64LE(eocd64 + 48));
	}
	const entries: ZipEntry[] = [];
	let at = cd_offset;
	for (let i = 0; i < count; i++) {
		if (at + 46 > zip.length || zip.readUInt32LE(at) !== CENTRAL) throw new ZipError(`bad central directory entry ${i}`);
		const made_by = zip.readUInt16LE(at + 4) >> 8;
		const flags = zip.readUInt16LE(at + 8);
		const method = zip.readUInt16LE(at + 10);
		const crc = zip.readUInt32LE(at + 16);
		let csize = zip.readUInt32LE(at + 20);
		let size = zip.readUInt32LE(at + 24);
		const name_length = zip.readUInt16LE(at + 28);
		const extra_length = zip.readUInt16LE(at + 30);
		const comment_length = zip.readUInt16LE(at + 32);
		const external = zip.readUInt32LE(at + 38);
		let offset = zip.readUInt32LE(at + 42);
		const name = zip.toString('utf8', at + 46, at + 46 + name_length);
		// A zip64 extra field carries whichever of the three sizes overflowed, in this order.
		let extra = at + 46 + name_length;
		const extra_end = extra + extra_length;
		while (extra + 4 <= extra_end) {
			const id = zip.readUInt16LE(extra);
			const length = zip.readUInt16LE(extra + 2);
			if (id === 0x0001) {
				let field = extra + 4;
				if (size === 0xffffffff) {
					size = Number(zip.readBigUInt64LE(field));
					field += 8;
				}
				if (csize === 0xffffffff) {
					csize = Number(zip.readBigUInt64LE(field));
					field += 8;
				}
				if (offset === 0xffffffff) offset = Number(zip.readBigUInt64LE(field));
			}
			extra += 4 + length;
		}
		at += 46 + name_length + extra_length + comment_length;

		if (flags & 1) throw new ZipError(`${name} is encrypted`);
		if (method !== 0 && method !== 8) throw new ZipError(`${name} uses compression method ${method}; only stored and deflated entries are read`);
		const unix_mode = made_by === UNIX || made_by === 19 ? external >>> 16 : null;
		const kind: ZipEntry['kind'] = name.endsWith('/') ? 'dir' : unix_mode !== null && (unix_mode & S_IFMT) === S_IFLNK ? 'symlink' : 'file';
		let cache: Buffer | null = null;
		entries.push({
			name,
			kind,
			mode: unix_mode === null ? null : unix_mode & 0o7777,
			size,
			bytes() {
				if (cache) return cache;
				if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== LOCAL) throw new ZipError(`${name}: bad local header`);
				const data = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
				if (data + csize > zip.length) throw new ZipError(`${name}: data runs past the end of the archive`);
				const raw = zip.subarray(data, data + csize);
				const out = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
				if (out.length !== size) throw new ZipError(`${name}: ${out.length} bytes, the archive says ${size}`);
				if ((crc32(out) >>> 0) !== crc) throw new ZipError(`${name}: CRC mismatch`);
				return (cache = out);
			}
		});
	}
	return entries;
}

function find_eocd(zip: Buffer): number {
	const floor = Math.max(0, zip.length - 22 - 0xffff);
	for (let at = zip.length - 22; at >= floor; at--) {
		if (zip.readUInt32LE(at) === EOCD && at + 22 + zip.readUInt16LE(at + 20) === zip.length) return at;
	}
	throw new ZipError('not a zip file');
}

/**
 * Writes the archive's entries under `into` and returns how many. Every path is checked to stay
 * inside it (no absolute names, drive letters, `..` segments or backslashes); a symlink has to
 * point inside too, and is skipped on Windows. Apple's `__MACOSX/` and `._` sidecars are skipped.
 */
export function extract_zip(zip_path: string, into: string): number {
	const root = resolve(into);
	mkdirSync(root, { recursive: true });
	let written = 0;
	for (const entry of read_zip(readFileSync(zip_path))) {
		const segments = entry.name.split('/').filter((segment, i, all) => segment !== '' || i < all.length - 1);
		if (segments.length === 0) continue;
		if (segments[0] === '__MACOSX' || basename(entry.name.replace(/\/$/, '')).startsWith('._')) continue;
		if (entry.name.startsWith('/') || /[\\:]/.test(entry.name) || segments.some((segment) => segment === '' || segment === '..' || segment === '.')) {
			throw new ZipError(`${entry.name} would land outside the directory`);
		}
		const destination = join(root, ...segments);
		if (entry.kind === 'dir') {
			mkdirSync(destination, { recursive: true });
		} else if (entry.kind === 'symlink') {
			if (process.platform === 'win32') continue;
			const target = entry.bytes().toString('utf8');
			const resolved = resolve(dirname(destination), target);
			if (target.startsWith('/') || !(resolved === root || resolved.startsWith(root + sep))) throw new ZipError(`${entry.name} links outside the directory, to ${target}`);
			mkdirSync(dirname(destination), { recursive: true });
			symlinkSync(target, destination);
		} else {
			mkdirSync(dirname(destination), { recursive: true });
			const mode = entry.mode === null ? 0o644 : entry.mode & 0o777;
			writeFileSync(destination, entry.bytes(), { mode });
			if (process.platform !== 'win32') chmodSync(destination, mode);
		}
		written++;
	}
	return written;
}

/** `source` (a file, or a directory with everything under it, like `ditto --keepParent`) as a zip at `out`. */
export function write_zip(source: string, out: string) {
	const inputs: ZipInput[] = [];
	const add = (path: string, name: string) => {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) {
			inputs.push({ name, target: readlinkSync(path), mode: 0o755, mtime: stat.mtime });
		} else if (stat.isDirectory()) {
			inputs.push({ name: `${name}/`, mode: stat.mode & 0o777, mtime: stat.mtime });
			for (const child of readdirSync(path).sort()) add(join(path, child), `${name}/${child}`);
		} else {
			inputs.push({ name, data: readFileSync(path), mode: stat.mode & 0o777, mtime: stat.mtime });
		}
	};
	add(resolve(source), basename(resolve(source)));
	writeFileSync(out, build_zip(inputs));
	if (statSync(out).size === 0) throw new ZipError(`${out} came out empty`);
}

/** The bytes of a zip holding `inputs`: deflated where that is smaller, unix modes in the external attributes. */
export function build_zip(inputs: ZipInput[]): Buffer {
	if (inputs.length >= 0xffff) throw new ZipError(`${inputs.length} entries; zip64 is not written`);
	const parts: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const input of inputs) {
		const kind: ZipEntry['kind'] = input.target !== undefined ? 'symlink' : input.name.endsWith('/') ? 'dir' : 'file';
		const data = kind === 'symlink' ? Buffer.from(input.target as string, 'utf8') : kind === 'dir' ? Buffer.alloc(0) : Buffer.from(input.data ?? '');
		let method = 0;
		let stored = data;
		if (kind === 'file' && data.length > 0) {
			const deflated = deflateRawSync(data, { level: 6 });
			if (deflated.length < data.length) {
				method = 8;
				stored = deflated;
			}
		}
		if (data.length >= 0xffffffff || stored.length >= 0xffffffff || offset >= 0xffffffff) throw new ZipError('an entry or the archive is 4 GB or more; zip64 is not written');
		const name = Buffer.from(input.name, 'utf8');
		const crc = crc32(data) >>> 0;
		const [time, date] = dos_time(input.mtime ?? new Date());
		const type = kind === 'symlink' ? S_IFLNK : kind === 'dir' ? S_IFDIR : S_IFREG;
		const mode = (type | (input.mode ?? (kind === 'file' ? 0o644 : 0o755))) & 0xffff;
		const external = ((mode << 16) | (kind === 'dir' ? 0x10 : 0)) >>> 0;

		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x800, 6);
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(stored.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		parts.push(local, name, stored);

		const record = Buffer.alloc(46);
		record.writeUInt32LE(CENTRAL, 0);
		record.writeUInt16LE((UNIX << 8) | 20, 4);
		record.writeUInt16LE(20, 6);
		record.writeUInt16LE(0x800, 8);
		record.writeUInt16LE(method, 10);
		record.writeUInt16LE(time, 12);
		record.writeUInt16LE(date, 14);
		record.writeUInt32LE(crc, 16);
		record.writeUInt32LE(stored.length, 20);
		record.writeUInt32LE(data.length, 24);
		record.writeUInt16LE(name.length, 28);
		record.writeUInt16LE(0, 30);
		record.writeUInt16LE(0, 32);
		record.writeUInt16LE(0, 34);
		record.writeUInt16LE(0, 36);
		record.writeUInt32LE(external, 38);
		record.writeUInt32LE(offset, 42);
		central.push(record, name);
		offset += local.length + name.length + stored.length;
	}
	const directory = Buffer.concat(central);
	if (offset + directory.length >= 0xffffffff) throw new ZipError('the archive is 4 GB or more; zip64 is not written');
	const end = Buffer.alloc(22);
	end.writeUInt32LE(EOCD, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(inputs.length, 8);
	end.writeUInt16LE(inputs.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);
	return Buffer.concat([...parts, directory, end]);
}

function dos_time(date: Date): [number, number] {
	const year = Math.max(1980, date.getFullYear());
	return [(date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()];
}
