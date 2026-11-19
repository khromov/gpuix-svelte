const delay = () => new Promise((resolve) => setTimeout(resolve, 10));

await delay();
if (typeof crypto.subtle?.digest !== 'function') throw new Error('crypto.subtle.digest is unavailable');
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gpuix'));
if (digest.byteLength !== 32) throw new Error('SHA-256 returned the wrong length');

const response = await fetch('https://example.com/');
if (!response.ok || !(await response.text()).includes('Example Domain')) {
	throw new Error(`HTTPS fetch failed: ${response.status}`);
}
console.log('txiki Android: timer, crypto and HTTPS passed');
