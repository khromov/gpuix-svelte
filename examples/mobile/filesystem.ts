import { readFile as readFileCallback, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

export async function check_filesystem() {
	const root = join(tmpdir(), `gpuix-svelte-check-${Date.now()}`);
	const file = join(root, 'bytes.bin');
	mkdirSync(root, { recursive: true });
	let stage = 'binary';
	try {
		writeFileSync(file, new Uint8Array([0, 127, 128, 255]));
		if (Array.from(readFileSync(file)).join(',') !== '0,127,128,255') throw new Error('binary round trip');
		if (!statSync(file).isFile() || !readdirSync(root).includes('bytes.bin')) throw new Error('metadata');
		const renamed = join(root, 'renamed.bin');
		renameSync(file, renamed);
		if (statSync(renamed).size !== 4) throw new Error('rename');
		stage = 'promise';
		await writeFile(file, 'Svelte → native files ✓', 'utf8');
		if (await readFile(file, 'utf8') !== 'Svelte → native files ✓') throw new Error('promise UTF-8 round trip');
		stage = 'callback';
		const callbackValue = await new Promise<string>((resolve, reject) => readFileCallback(file, 'utf8', (error, value) => error ? reject(error) : resolve(value)));
		if (callbackValue !== 'Svelte → native files ✓') throw new Error('callback UTF-8 round trip');
		if (resolve('/first', '/last') !== '/last') throw new Error('absolute path resolution');
	} catch (error) {
		throw new Error(`${stage}: ${String(error)} (${(error as NodeJS.ErrnoException).code})`, { cause: error });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	try {
		readFileSync(file);
		throw new Error('removed file remained readable');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`removed: ${String(error)} (${(error as NodeJS.ErrnoException).code})`, { cause: error });
	}
}
