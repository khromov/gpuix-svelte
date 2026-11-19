const cwd = globalThis.process?.cwd?.() || '/';
export const sep = '/';
export const delimiter = ':';
function asPath(value: string): string {
	if (typeof value !== 'string') throw new TypeError('path must be a string');
	return value;
}
export function normalize(value: string): string {
	const path = asPath(value);
	if (!path) return '.';
	const absolute = path.startsWith(sep);
	const trailing = path.endsWith(sep);
	const parts: string[] = [];
	for (const part of path.split(sep)) {
		if (!part || part === '.') continue;
		if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
		else if (part !== '..' || !absolute) parts.push(part);
	}
	let result = `${absolute ? sep : ''}${parts.join(sep)}`;
	if (!result) result = absolute ? sep : '.';
	if (trailing && result !== sep) result += sep;
	return result;
}
export const isAbsolute = (path: string): boolean => asPath(path).startsWith(sep);
export function join(...paths: string[]): string {
	const nonEmpty = paths.map(asPath).filter(Boolean);
	return nonEmpty.length ? normalize(nonEmpty.join(sep)) : '.';
}
export function resolve(...paths: string[]): string {
	let result = '';
	for (let i = paths.length - 1; i >= 0 && !result.startsWith(sep); i--) {
		const part = asPath(paths[i]!);
		if (part) result = `${part}/${result}`;
	}
	if (!result.startsWith(sep)) result = `${cwd}/${result}`;
	const resolved = normalize(result);
	return resolved.length > 1 ? resolved.replace(/\/$/, '') : resolved;
}
export function dirname(value: string): string {
	const path = asPath(value);
	if (!path) return '.';
	const rooted = path[0] === sep;
	let end = -1; let matchedSlash = true;
	for (let i = path.length - 1; i >= 1; i--) {
		if (path[i] === sep) { if (!matchedSlash) { end = i; break; } }
		else matchedSlash = false;
	}
	if (end === -1) return rooted ? sep : '.';
	if (rooted && end === 1) return '//';
	return path.slice(0, end);
}
export function basename(path: string, suffix?: string): string {
	let base = asPath(path).replace(/\/+$/, '').split(sep).at(-1) || '';
	if (suffix !== undefined && asPath(suffix) && base.endsWith(suffix)) base = base.slice(0, -suffix.length);
	return base;
}
export function extname(path: string): string {
	const base = basename(path); const index = base.lastIndexOf('.');
	return index <= 0 || base === '..' ? '' : base.slice(index);
}
export default { sep, delimiter, isAbsolute, normalize, join, resolve, dirname, basename, extname };
