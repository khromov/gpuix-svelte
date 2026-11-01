#!/usr/bin/env node
// @ts-check
/**
 * `gpuix-svelte-update keygen | manifest | verify` — the release side of gpuix-svelte/update: a
 * signing key pair, one manifest merged from every platform's build fragment, and a check of a
 * manifest against a public key. Plain JS, since it is what a CI job runs before anything is built.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE = `usage:
  gpuix-svelte-update keygen [--out update-key.pem]
      writes the private key (refusing to overwrite one) and prints the public key for app.update.publicKey
  gpuix-svelte-update manifest --out update.json --base-url <url> [--notes <file>] [--url <page>] [--key <pem file>] <update-*.json>...
      one manifest from the fragments build({ archive: true }) wrote; --key, or GPUIX_UPDATE_KEY holding the PEM, signs it
  gpuix-svelte-update verify --public-key <base64> <update.json>
      exits 0 when the manifest's signature checks out`;

const [command, ...rest] = process.argv.slice(2);
/** @type {Record<string, string>} */
const flags = {};
/** @type {string[]} */
const positional = [];
for (let i = 0; i < rest.length; i++) {
	const arg = rest[i];
	if (arg.startsWith('--')) {
		const value = rest[i + 1];
		if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`, 2);
		flags[arg.slice(2)] = value;
		i++;
	} else {
		positional.push(arg);
	}
}

/** @returns {never} */
function fail(/** @type {string} */ message, code = 1) {
	console.error(`gpuix-svelte-update: ${message}`);
	if (code === 2) console.error(USAGE);
	process.exit(code);
}

const { build_manifest, generate_keys, verify_manifest } = await import('gpuix-svelte/update');

switch (command) {
	case 'keygen': {
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
		const fragments = positional.map((file) => {
			try {
				return JSON.parse(readFileSync(file, 'utf8'));
			} catch (error) {
				return fail(`${file}: ${/** @type {Error} */ (error).message}`);
			}
		});
		const private_key = flags.key ? readFileSync(flags.key, 'utf8') : process.env.GPUIX_UPDATE_KEY;
		try {
			const manifest = build_manifest({
				fragments,
				base_url: flags['base-url'],
				notes: flags.notes ? readFileSync(flags.notes, 'utf8') : undefined,
				url: flags.url,
				private_key: private_key || undefined
			});
			writeFileSync(flags.out, JSON.stringify(manifest, null, '\t') + '\n');
			console.error(`${flags.out}: ${manifest.version} for ${Object.keys(manifest.platforms).join(', ')}${manifest.signature ? ', signed' : ', unsigned'}`);
		} catch (error) {
			fail(/** @type {Error} */ (error).message);
		}
		break;
	}
	case 'verify': {
		if (!flags['public-key'] || positional.length !== 1) fail('verify needs --public-key and one manifest', 2);
		const manifest = JSON.parse(readFileSync(positional[0], 'utf8'));
		if (!verify_manifest(manifest, flags['public-key'])) fail(`${positional[0]} is not signed with that key`);
		console.error(`${positional[0]}: signature ok`);
		break;
	}
	default:
		fail(command ? `unknown command ${command}` : 'no command', 2);
}
