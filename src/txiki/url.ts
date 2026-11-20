import { resolve } from './path.ts';

export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export function fileURLToPath(value: string | URL): string {
	const url = typeof value === 'string' ? new URL(value) : value;
	if (!(url instanceof URL)) throw new TypeError('The path must be a string or URL');
	if (url.protocol !== 'file:') throw new TypeError('The URL must be of scheme file');
	if (url.hostname !== '' && url.hostname !== 'localhost') throw new TypeError('File URL host must be localhost or empty');
	if (/%2f/i.test(url.pathname)) throw new TypeError('File URL path must not include encoded / characters');
	return decodeURIComponent(url.pathname);
}

export function pathToFileURL(path: string): URL {
	if (typeof path !== 'string') throw new TypeError('The path must be a string');
	let absolute = resolve(path);
	if (path.endsWith('/') && !absolute.endsWith('/')) absolute += '/';
	const url = new URL('file:///');
	url.pathname = absolute.replace(/%/g, '%25').replace(/\\/g, '%5C').replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/\t/g, '%09');
	return url;
}

export default { URL, URLSearchParams, fileURLToPath, pathToFileURL };
