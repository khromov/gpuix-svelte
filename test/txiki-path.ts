import assert from 'node:assert/strict';
import { posix as node } from 'node:path';
import * as mobile from '../src/txiki/path.ts';

const paths = ['', '/', '//', '///a//b/', '.', '..', 'a/.', 'a/..', '.foo', '..foo', '...', 'foo.', '/a/b', 'a//b', 'a/b.tar.gz', '../a/../b/'];
for (const path of paths) {
	for (const method of ['normalize', 'dirname', 'basename', 'extname', 'parse'] as const) {
		assert.deepEqual(mobile[method](path), node[method](path), `${method}(${JSON.stringify(path)})`);
	}
	for (const to of paths) assert.equal(mobile.relative(path, to), node.relative(path, to), `relative(${path}, ${to})`);
	assert.equal(mobile.format(mobile.parse(path)), node.format(node.parse(path)));
}
for (const value of [{ root: '/', name: 'foo', ext: 'txt' }, { dir: '/tmp', base: 'x', name: 'y' }, { dir: '.', name: 'x', ext: '.js' }]) {
	assert.equal(mobile.format(value), node.format(value));
}
assert.equal(mobile.posix.relative('/a/b', '/a/c'), '../c');
assert.equal(mobile.posix.posix, mobile.posix);
const cwd = process.cwd();
try {
	process.chdir('/tmp');
	assert.equal(mobile.resolve('file'), node.resolve('file'));
} finally { process.chdir(cwd); }
console.log('txiki-path ok');
