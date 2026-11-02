// @ts-check
/**
 * `gpuix-svelte update keygen | manifest | verify` — the release side of gpuix-svelte/update: a
 * signing key pair, one manifest merged from every platform's build fragment, and a check of a
 * manifest against a public key. A subcommand of the launcher rather than a bin of its own, so
 * `npx gpuix-svelte update` can never fall back to a registry package of a similar name. Plain JS,
 * since it is what a CI job runs before anything is built.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const USAGE = `usage:
  gpuix-svelte update keygen [--out update-key.pem]
      writes the private key (refusing to overwrite one) and prints the public key for app.update.publicKey
  gpuix-svelte update manifest --out update.json --base-url <url> [--notes <file>] [--url <page>] [--key <pem file>] [--public-key <base64>] <update-*.json>...
      one manifest from the fragments build({ archive: true }) wrote; --key, or GPUIX_UPDATE_KEY holding the PEM,
      signs it, and --public-key checks the result (so a missing key fails the release instead of the update)
  gpuix-svelte update verify --public-key <base64> <update.json>
      exits 0 when the manifest's signature checks out`;

/** @type {Record<string, Record<string, { type: 'string' }>>} */
const OPTIONS = {
	keygen: { out: { type: 'string' } },
	manifest: { out: { type: 'string' }, 'base-url': { type: 'string' }, notes: { type: 'string' }, url: { type: 'string' }, key: { type: 'string' }, 'public-key': { type: 'string' } },
	verify: { 'public-key': { type: 'string' } }
};

/** @returns {never} */
function fail(/** @type {string} */ message, code = 1) {
	console.error(`gpuix-svelte update: ${message}`);
	if (code === 2) console.error(USAGE);
	process.exit(code);
}

function read(/** @type {string} */ file, /** @type {string} */ what) {
	try {
		return readFileSync(file, 'utf8');
	} catch (error) {
		return fail(`cannot read ${what} ${file}: ${/** @type {Error} */ (error).message}`);
	}
}

function read_json(/** @type {string} */ file, /** @type {string} */ what) {
	try {
		return JSON.parse(read(file, what));
	} catch (error) {
		return fail(`${file} is not JSON: ${/** @type {Error} */ (error).message}`);
	}
}

/** Runs the subcommand and exits the process. */
export async function run(/** @type {string[]} */ argv) {
	const [command, ...rest] = argv;
	if (!command || !(command in OPTIONS)) fail(command ? `unknown command ${command}` : 'no command', 2);

	/** @type {Record<string, string | undefined>} */
	let flags;
	/** @type {string[]} */
	let positional;
	try {
		({ values: flags, positionals: positional } = parseArgs({ args: rest, options: OPTIONS[command], allowPositionals: true, strict: true }));
	} catch (error) {
		fail(/** @type {Error} */ (error).message, 2);
	}

	// Through the package's own exports: src/update.ts in the repo, lib/update.js once packed.
	const { build_manifest, generate_keys, is_public_key, verify_manifest } = await import('gpuix-svelte/update');
if (flags['public-key'] !== undefined && !is_public_key(flags['public-key'])) {
	fail(`--public-key is not the key keygen printed (32 bytes, base64); a shell may have rewritten it: ${flags['public-key']}`, 2);
}

	switch (command) {
		case 'keygen': {
			if (positional.length) fail('keygen takes no file arguments', 2);
			const out = resolve(flags.out ?? 'update-key.pem');
			if (existsSync(out)) fail(`${out} exists; pick another --out or delete it first`);
			const { publicKey, privateKey } = generate_keys();
			writeFileSync(out, privateKey, { mode: 0o600 });
			console.error(`private key written to ${out} — keep it out of git; CI reads it from the GPUIX_UPDATE_KEY secret`);
			console.error('public key, for app.update.publicKey in standalone.ts:');
			console.log(publicKey);
			break;
		}
		case 'manifest': {
			if (!flags.out || !flags['base-url'] || positional.length === 0) fail('manifest needs --out, --base-url and at least one fragment', 2);
			const fragments = positional.map((file) => read_json(file, 'the fragment'));
			const private_key = flags.key ? read(flags.key, 'the private key') : process.env.GPUIX_UPDATE_KEY;
			if (!private_key && flags['public-key']) fail('--public-key was given but there is no private key to sign with (--key, or GPUIX_UPDATE_KEY)');
			if (process.env.GPUIX_UPDATE_KEY === '' && !flags.key) console.error('gpuix-svelte update: GPUIX_UPDATE_KEY is set but empty; writing an unsigned manifest');
			try {
				const manifest = build_manifest({
					fragments,
					base_url: flags['base-url'],
					notes: flags.notes ? read(flags.notes, 'the notes') : undefined,
					url: flags.url,
					private_key: private_key || undefined
				});
				if (flags['public-key'] && !verify_manifest(manifest, flags['public-key'])) fail('the signed manifest does not verify with --public-key; the key pair does not match');
				writeFileSync(flags.out, JSON.stringify(manifest, null, '\t') + '\n');
				console.error(`${flags.out}: ${manifest.version} for ${Object.keys(manifest.platforms).join(', ')}${manifest.signature ? ', signed' : ', unsigned'}`);
			} catch (error) {
				fail(/** @type {Error} */ (error).message);
			}
			break;
		}
		case 'verify': {
			if (!flags['public-key'] || positional.length !== 1) fail('verify needs --public-key and one manifest', 2);
			const manifest = read_json(positional[0], 'the manifest');
			if (!verify_manifest(manifest, flags['public-key'])) fail(`${positional[0]} is not signed with that key`);
			console.error(`${positional[0]}: signature ok`);
			break;
		}
	}
	process.exit(0);
}
