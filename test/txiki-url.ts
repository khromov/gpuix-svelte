import assert from 'node:assert/strict';
import * as node from 'node:url';
import * as mobile from '../src/txiki/url.ts';

for (const path of ['', '.', 'a/b', '/tmp/a b', '/tmp/100%?', '/tmp/hash#name', '/tmp/a\\b', '/tmp/a\nb\tc\rd', '/tmp/a/', '/tmp/é', '/tmp/:@&=+$,;']) {
	const expected = node.pathToFileURL(path);
	const actual = mobile.pathToFileURL(path);
	assert.equal(actual.href, expected.href, path);
	assert.equal(mobile.fileURLToPath(actual), node.fileURLToPath(expected), path);
}
for (const url of ['file:///tmp/test%20file', 'file://localhost/tmp/test', 'file:///tmp/back%5Cslash', 'file:///tmp/%C3%A9']) {
	assert.equal(mobile.fileURLToPath(url), node.fileURLToPath(url));
}
for (const url of ['https://example.com/file', 'file://example.com/file', 'file:///tmp/a%2fb']) {
	assert.throws(() => mobile.fileURLToPath(url));
	assert.throws(() => node.fileURLToPath(url));
}
assert.throws(() => mobile.fileURLToPath('file:///tmp/%ff'));
assert.equal(mobile.URL, URL);
assert.equal(mobile.URLSearchParams, URLSearchParams);
console.log('txiki-url ok');
