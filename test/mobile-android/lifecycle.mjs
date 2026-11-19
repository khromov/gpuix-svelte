#!/usr/bin/env node
// Installed QuickJsFixture.svelte, Android emulator, macOS Vision OCR.
// No force-stop, process killing, synthetic JS, or retained-tree test hooks.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const serial = process.env.ANDROID_SERIAL ?? '';
if (!serial.startsWith('emulator-')) throw Error('Set ANDROID_SERIAL to an emulator (physical testing requires separate authorization).');
const softOnly = process.env.ANDROID_SOFT_KEYBOARD_TEST === 'only';
const output = resolve(process.env.EVIDENCE_DIR ?? '/tmp/gpuix-android-lifecycle');
mkdirSync(output, { recursive: true });
/** @overload @param {string} command @param {string[]} args @returns {string} */
/** @overload @param {string} command @param {string[]} args @param {true} binary @returns {Buffer} */
/** @param {string} command @param {string[]} args @param {boolean} binary */
function exec(command, args, binary = false) {
  const r = spawnSync(command, args, { encoding: binary ? undefined : 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`${command} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
/** @param {...string} args */
const adb = (...args) => exec('adb', ['-s', serial, ...args]);
// adb shell joins arguments into a remote shell command; IME lists contain ';'.
/** @param {string} value */
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
if (adb('shell', 'getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Not an Android emulator');
const ocr = join(output, 'ocr');
exec('swiftc', [fileURLToPath(new URL('./ocr.swift', import.meta.url)), '-o', ocr]);
const pkg = 'dev.gpuix.quickjsfixture';
const component = `${pkg}/dev.gpui.mobile.GpuiInputActivity`;
const launch = () => adb('shell', 'am', 'start', '-W', '-n', component);
const pid = () => adb('shell', 'pidof', pkg).trim();
const originalRotation = adb('shell', 'settings', 'get', 'system', 'user_rotation').trim();
const originalAuto = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation').trim();
const originalKeyboard = adb('shell', 'settings', 'get', 'secure', 'show_ime_with_hard_keyboard').trim();
const originalSubtype = adb('shell', 'settings', 'get', 'secure', 'selected_input_method_subtype').trim();
const originalEnabled = adb('shell', 'settings', 'get', 'secure', 'enabled_input_methods').trim();
/** @param {string} s */
const normalize = s => s.replace(/[“”]/g, '"').toLowerCase();
/** @type {{width:number, height:number, rows:Array<{text:string, x:number, y:number}>}} */
let frame = { width: 0, height: 0, rows: [] };
/** @param {string} name */
function capture(name) {
  const path = join(output, `${name}.png`);
  writeFileSync(path, exec('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], true));
  frame = JSON.parse(exec(ocr, [path]));
  return frame.rows;
}
/** @param {string} text @param {string} [name] @param {'landscape'|'portrait'|null} [orientation] */
async function expect(text, name = text.replace(/\W+/g, '-'), orientation = null) {
  let rows;
  for (let n = 0; n < (orientation ? 40 : 12); n++) {
    rows = capture(name);
    const row = rows.find(r => normalize(r.text).includes(normalize(text)));
    const sizeMatches = orientation === 'landscape' ? frame.width > frame.height
      : orientation === 'portrait' ? frame.height > frame.width : true;
    if (row && sizeMatches) { console.log(`${name}: ${row.text}`); return row; }
    await sleep(250);
  }
  throw Error(`Expected ${text}, OCR saw ${JSON.stringify(rows)}`);
}
/** @param {string} text @param {boolean} [atEnd] */
async function tap(text, atEnd = false) {
  const row = await expect(text, 'before-tap');
  const target = atEnd ? frame.rows.find(r => normalize(r.text).includes(normalize(text)) && !r.text.includes('Loaded')) : row;
  if (!target) throw Error(`Could not find input text ${text}`);
  const x = atEnd ? frame.width * 0.88 : target.x;
  adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(target.y)));
  await sleep(200);
}
async function waitForInput() {
  // Do not race UI-thread InputProxy installation or Gboard startup. Injected
  // hardware keys before the InputConnection is served can be consumed by IME.
  let ready = false;
  for (let n = 0; n < 40; n++) {
    const dump = adb('shell', 'dumpsys', 'input_method');
    const log = logs(pid());
    const requests = [...log.matchAll(/ImeTracker: dev\.gpuix\.quickjsfixture:([\da-f]+): onRequestShow/g)].map(match => match[1]);
    const pending = requests.reverse().find(token => !log.includes(`${pkg}:${token}: onCancelled`));
    const shown = pending && log.includes(`${pkg}:${pending}: onShown`);
    if (shown && /mInputShown=true/.test(dump) && /mInputViewStarted=true/.test(dump) && /mServedInputConnection=.*InputProxy/.test(dump)) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) throw Error('Native InputConnection/IME did not become ready');
  await sleep(1000);
}
/** @param {string} text */
async function type(text) {
  await waitForInput();
  adb('shell', 'input', 'text', text);
  await expect(text, 'typed-native-text');
}
/** @param {string} p */
const logs = p => adb('logcat', '-d', `--pid=${p}`);
/** @param {string} s @param {string} text */
const count = (s, text) => s.split(text).length - 1;
/** @param {string} p @param {number} cycle */
async function recreate(p, cycle) {
  const before = count(logs(p), 'MainEvent::Destroy');
  // Back may first dismiss the IME. Require an actual Destroy, not just HOME.
  for (let n = 0; n < 3 && count(logs(p), 'MainEvent::Destroy') === before; n++) {
    adb('shell', 'input', 'keyevent', 'BACK');
    await sleep(1200);
  }
  for (let n = 0; n < 20 && count(logs(p), 'WaitableNativeActivityState::drop!') < before + 1; n++) await sleep(200);
  const stopped = logs(p);
  if (count(stopped, 'MainEvent::Destroy') !== before + 1 ||
      count(stopped, 'WaitableNativeActivityState::drop!') < before + 1 ||
      count(stopped, 'QuickJS runtime session disposed') < before + 1 ||
      count(stopped, 'Android session GPU device released') < before + 1) throw Error('Native Activity/runtime did not finish teardown');
  if (pid() !== p) throw Error('Process exited during Activity destruction');
  launch();
  if (pid() !== p) throw Error('PID changed: this is not same-process recreation');
  await expect('Loaded "everything"', `${cycle}-recreated`);
  await tap('First input');
  await type(`cycle${cycle}`);
  await tap('Search first');
  await expect(`Loaded "cycle${cycle}"`, `${cycle}-input-after-recreation`);
}
let testFailed = false;
try {
  if (process.env.ANDROID_IME_SUBTYPE) {
    // Android otherwise restores the sole enabled handwriting subtype on each
    // new InputConnection. This is emulator test configuration, restored below.
    const enabled = originalEnabled.split(':').map(ime => ime.startsWith('com.google.android.inputmethod.latin/')
      ? `${ime.split(';')[0]};${process.env.ANDROID_IME_SUBTYPE}` : ime).join(':');
    adb('shell', 'settings', 'put', 'secure', 'enabled_input_methods', shellQuote(enabled));
    adb('shell', 'settings', 'put', 'secure', 'selected_input_method_subtype', process.env.ANDROID_IME_SUBTYPE);
  }
  adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  launch();
  const p = pid();
  writeFileSync(join(output, 'pid.txt'), p + '\n');
  console.log(`Testing ${softOnly ? 'standalone soft keyboard' : 'same-process lifecycle'}: PID ${p}`);
  await expect('QuickJS integration', 'initial-render');
  // Recreate before asserting fresh state, so this can start with an existing app.
  if (!softOnly) {
    for (let cycle = 1; cycle <= 3; cycle++) await recreate(p, cycle);
    await tap('Second input');
    await type('second7');
    await tap('Search second');
    await expect('Loaded "second7"', 'second-binding');
    await tap('Search first');
    await expect('Loaded "cycle3"', 'first-binding-still-independent');
    adb('shell', 'input', 'keyevent', 'HOME');
    await sleep(800);
    launch();
    await expect('Loaded "cycle3"', 'background-resume');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
    await sleep(1200);
    await expect('Loaded "cycle3"', 'landscape', 'landscape');
    if (frame.width <= frame.height) throw Error('Display did not rotate to landscape');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
    await sleep(1200);
    await expect('Loaded "cycle3"', 'portrait', 'portrait');
    if (frame.height <= frame.width) throw Error('Display did not return to portrait');
    await tap('second7', true);
    await type('rotated8');
    await tap('Search second');
    await expect('Loaded "second7rotated8"', 'input-after-rotation');
  }
  if (['1', 'only'].includes(process.env.ANDROID_SOFT_KEYBOARD_TEST ?? '')) {
    // Separate coverage: actual on-screen Gboard keys, NOT `input text`.
    // This optional fixture case deliberately pins the tested emulator layout.
    await tap('second7rotated8', true);
    await waitForInput();
    if (!capture('before-soft-keyboard').some(row => row.text.includes('?123'))) {
      adb('shell', 'input', 'keycombination', '57', '39'); // Gboard Alt+K: show keyboard
    }
    const anchor = await expect('?123', 'soft-keyboard');
    if (frame.width !== 1080 || frame.height !== 2400 ||
        Math.abs(anchor.x - 267) > 20 || anchor.y < 1000 || anchor.y > 1900) {
      throw Error('Soft-key test requires the documented 1080×2400 floating Gboard QWERTY layout');
    }
    // Gboard can move the floating panel vertically after rotation. The key
    // geometry is fixed here, but positions are relative to its visible anchor.
    for (const [dx, dy] of [[107, -261], [665, -391], [278, -261], [323, -391], [408, -1]]) {
      adb('shell', 'input', 'tap', String(Math.round(anchor.x + dx)), String(Math.round(anchor.y + dy))); // s, o, f, t, space/commit
      await sleep(250);
    }
    await expect('second7rotated8soft', 'soft-key-typed');
    await tap('Search second');
    await expect('Loaded "second7rotated8soft"', 'soft-key-binding');
    console.log('PASS: on-screen Gboard taps, IME commit and bound search value');
  }
  if (pid() !== p) throw Error('PID changed during lifecycle test');
  const log = logs(p);
  writeFileSync(join(output, 'logcat.txt'), log);
  if (/PANIC|FATAL EXCEPTION|runtime stopped|RustPanic|GPU error during frame|wgpu device lost: reason=(?!Destroyed)/.test(log)) throw Error('Panic or runtime failure in logcat');
  console.log(softOnly
    ? `PASS: standalone soft-keyboard case, PID ${p}. No lifecycle cycles claimed. Evidence: ${output}`
    : `PASS: 3 Activity destroy/relaunch cycles, native input/bindings/effects, HOME resume and rotation, all PID ${p}. Evidence: ${output}`);
} catch (error) {
  testFailed = true;
  throw error;
} finally {
  // Try every restoration and preserve the original failure if ADB disconnected.
  /** @type {unknown[]} */
  const errors = [];
  /** @param {...string} args */
  const restore = (...args) => {
    try { adb(...args); } catch (error) { errors.push(error); }
  };
  if (process.env.ANDROID_IME_SUBTYPE) {
    restore('shell', 'settings', 'put', 'secure', 'enabled_input_methods', shellQuote(originalEnabled));
    if (originalSubtype === 'null') restore('shell', 'settings', 'delete', 'secure', 'selected_input_method_subtype');
    else restore('shell', 'settings', 'put', 'secure', 'selected_input_method_subtype', originalSubtype);
  }
  if (originalKeyboard === 'null') restore('shell', 'settings', 'delete', 'secure', 'show_ime_with_hard_keyboard');
  else restore('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', originalKeyboard);
  for (const [key, value] of [['user_rotation', originalRotation], ['accelerometer_rotation', originalAuto]]) {
    if (value === 'null') restore('shell', 'settings', 'delete', 'system', key);
    else restore('shell', 'settings', 'put', 'system', key, value);
  }
  if (errors.length) {
    if (testFailed) console.error('Settings restoration also failed; restore manually:', errors);
    else {
      console.error(new AggregateError(errors, 'Settings restoration failed'));
      process.exitCode = 1;
    }
  }
}
