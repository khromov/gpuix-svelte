/** The playground's link format: the source deflated and base64url-encoded in the URL's hash. */

import type { Target } from './modules.ts';

const to_base64url = (bytes: Uint8Array) => {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const from_base64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const through = async (bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) =>
	new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function encode_hash(source: string, target: Target): Promise<string> {
	const z = to_base64url(await through(new TextEncoder().encode(source), new CompressionStream('deflate-raw')));
	return `#${new URLSearchParams({ renderer: target, z })}`;
}

/** `code` is the uncompressed form the first links carried, which still open. */
export async function decode_hash(hash: string): Promise<{ source: string | null; target: Target | null }> {
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const renderer = params.get('renderer');
	let source: string | null = null;
	try {
		const z = params.get('z');
		const code = params.get('code');
		if (z) source = new TextDecoder().decode(await through(from_base64url(z), new DecompressionStream('deflate-raw')));
		else if (code) source = new TextDecoder().decode(from_base64url(code));
	} catch {
		source = null;
	}
	return { source, target: renderer === 'gpui' || renderer === 'dom' ? renderer : null };
}
