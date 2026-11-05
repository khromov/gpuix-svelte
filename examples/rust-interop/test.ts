/**
 * The app headless: every transport comes up, one click reaches all four Rust copies
 * and their replies land in the log, and each pushes on its own. Needs cargo;
 * `--experimental-ffi` for the FFI card on Node.
 */

import { mount_headless, click_text, wait_for, find_test_id, all_text, screenshot, check, finish } from 'gpuix-svelte/test';
import { ensure_built, TRANSPORTS } from './transports/index.ts';

ensure_built();

const App = (await import('./App.svelte')).default;
mount_headless(App, { width: 1000, height: 540 });

await wait_for(() => !all_text().includes('connecting'), { timeout: 5000, label: 'every transport settled' });
// The card's error text is the actual value, so a failed one says why in the test output.
for (const t of TRANSPORTS) check(`${t.id} ready`, find_test_id(`error-${t.id}`)?.children?.[0]?.text ?? 'ready', 'ready');

click_text('fib 50');
const replies = () => all_text().filter((t) => t === '12586269025').length;
await wait_for(() => replies() === TRANSPORTS.length, { timeout: 3000, label: 'fib replies' });
check('fib 50 answered by all four', replies(), 4);

click_text('greet gpuix');
await wait_for(() => all_text().filter((t) => t.startsWith('Hello, gpuix!')).length === 4, { timeout: 3000, label: 'greet replies' });
check('greet answered by all four', all_text().filter((t) => t.startsWith('Hello, gpuix!')).length, 4);

const pushes = (id: string) => Number(find_test_id(`pushes-${id}`)?.children?.[0]?.text ?? '0');
await wait_for(() => TRANSPORTS.every((t) => pushes(t.id) >= 1), { timeout: 3000, label: 'a push from each' });
for (const t of TRANSPORTS) check(`${t.id} pushed on its own`, pushes(t.id) >= 1);
check('a push is a tick', all_text().some((t) => /^tick \d+$/.test(t)));

if (process.env.GPUIX_SCREENSHOT) screenshot(process.env.GPUIX_SCREENSHOT);
finish('rust-interop', 11);
