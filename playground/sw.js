// GPUI's wasm needs SharedArrayBuffer, which a page gets only when it is cross-origin isolated, and
// a static host such as GitHub Pages cannot send the two headers. Registered for the playground's
// scope only, this re-serves what the playground fetches with them (the coi-serviceworker technique).

// The repository's tsconfig has the DOM lib, where the global scope is a Window, not a service worker's.
const worker = /** @type {any} */ (globalThis);

// Safari has no `credentialless`, so the page asks for `require-corp` there.
const coep = new URL(worker.location.href).searchParams.get('coep') === 'require-corp' ? 'require-corp' : 'credentialless';

worker.addEventListener('install', () => worker.skipWaiting());
worker.addEventListener('activate', (/** @type {any} */ event) => event.waitUntil(worker.clients.claim()));

worker.addEventListener('fetch', (/** @type {any} */ event) => {
	/** @type {Request} */
	const request = event.request;
	if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

	const outgoing = coep === 'credentialless' && request.mode === 'no-cors' ? new Request(request, { credentials: 'omit' }) : request;
	event.respondWith(
		fetch(outgoing).then((response) => {
			if (response.status === 0) return response;
			const headers = new Headers(response.headers);
			headers.set('Cross-Origin-Embedder-Policy', coep);
			headers.set('Cross-Origin-Opener-Policy', 'same-origin');
			if (coep === 'require-corp') headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
			return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
		})
	);
});
