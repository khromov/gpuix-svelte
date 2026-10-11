/**
 * Assertions for the plain scripts under `test/` — no runner, exit 1 on failure. Split
 * out of `test.ts` so the windowed harness shares the one counter `finish` checks
 * against, rather than importing the headless renderer to reach it.
 */

let failures = 0;
let ran = 0;

export function check(label: string, actual: unknown, expected: unknown = true): boolean {
	ran++;
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(
		`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`}`
	);
	return ok;
}

export const failed = () => failures;

/**
 * Prints the verdict and exits, so nothing left on a timer keeps the process alive.
 * `expected` is how many `check` calls should have run: nothing else counts them, so
 * assertions that stop executing would otherwise take the file green with them.
 */
export function finish(name: string, expected?: number): never {
	if (ran === 0 || (expected !== undefined && ran !== expected)) {
		console.error(`\n${name}: ran ${ran} assertion(s), expected ${expected ?? 'at least one'}`);
		process.exit(1);
	}
	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log(`\n${name} ok`);
	process.exit(0);
}
