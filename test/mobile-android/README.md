# Android mobile regressions

## Accessibility and mobile APIs

Build and install `examples/mobile` for Android, then run:

```sh
ANDROID_SERIAL=emulator-5554 node test/mobile-android/accessibility.mjs
```

The test installs a separate instrumentation app, force-stops and relaunches the counter,
queries its native accessibility tree and activates controls through Android accessibility
actions. It checks the filesystem and clipboard, selects a test file through DocumentsUI,
cancels a second picker and verifies browser handoff. It creates and removes
`/sdcard/Download/gpuix-picker.txt`; do not run it where that name contains data you need.
It requires an Android emulator with DocumentsUI in English and a configured browser. The
checks are not TalkBack speech/gesture tests or physical-device validation.

## Historical QuickJS fixture

The following lifecycle harness targets the removed standalone QuickJS host and is not a txiki test.
Use `test/txiki-android/app-test.py` for the current mobile runtime.

Build/install `examples/quickjs/main.ts` with the source-fork mobile CLI, using
app ID `dev.gpuix.quickjsfixture`. This test intentionally does **not** install,
force-stop, or kill the app: destruction/relaunch must retain its process PID.

Requirements: macOS (Swift/Vision OCR), Node, Android platform tools in `PATH`,
and a running ARM64 Android emulator. Physical devices are rejected. The script
uses native `adb input` touch/key injection and framebuffer OCR, not JS dispatch
or retained-tree mocks. This is emulator evidence, not physical-device testing.

```sh
ANDROID_SERIAL=emulator-5554 \
  EVIDENCE_DIR=/tmp/gpuix-android-lifecycle \
  node test/mobile-android/lifecycle.mjs
```

The tested Google emulator had **only Gboard's handwriting subtype enabled**.
Injected hardware keys must wait for the served InputConnection **and** the
IME's `onShown` completion; `mInputShown` alone is true before startup finishes.
The default test does not change the selected subtype. Optional
`ANDROID_IME_SUBTYPE=137935560` requests US QWERTY, but Gboard can overwrite that
setting: verify the actual keyboard rather than assuming it took effect. This
subtype ID is Gboard-specific, not an application API. Keyboard visibility,
rotation and any requested subtype settings are restored in `finally`; the
macOS lock state is never changed.

The test requires three real `MainEvent::Destroy` events, completion of native
teardown, release of the session GPU device and disposal of each QuickJS runtime;
a new render and working input
after each launch; two independent controlled input fields; promise/effect output;
HOME/resume; landscape/portrait and newly typed text after rotation. The latter
taps the field's empty right side to place the caret at the end, not in its text.
PID changes, unexpected GPU errors or panic/runtime failure logs fail the test. Activity destruction starts a **fresh** Svelte app;
it is not a claim that in-memory Svelte state survives destruction. HOME/resume
and handled rotation must preserve the existing session and input state.

Screenshots, original PID and logcat go into `EVIDENCE_DIR`. OCR is CPU-based and
can run while the host macOS session is locked. InputConnection readiness is
checked before typing; the script does not bypass IME or inject JS state. Its
`adb input text` coverage is native **hardware-key injection**, not proof of
soft-keyboard tap, arbitrary-language composition, TalkBack or physical input.

For the separately tested floating Gboard QWERTY layout on the 1080×2400
emulator, set `ANDROID_SOFT_KEYBOARD_TEST=1`. After the lifecycle cases it uses
Gboard's native Alt+K shortcut if needed, verifies the keyboard's pixel anchor, taps the
actual **s, o, f, t, space** keys, and checks the rendered field and bound search
result. It does not use `input text` for those characters. This pins a concrete
keyboard layout and fails rather than guessing coordinates on another layout;
it allows vertical movement of the floating panel by locating its `?123` anchor.
It is not a generic keyboard driver or arbitrary-language composition test.

After a normal run has left `second7rotated8` in the second field, the soft-key
case can be run alone with `ANDROID_SOFT_KEYBOARD_TEST=only`. This mode explicitly
claims **no lifecycle cycles**, does not destroy/relaunch the Activity, and refuses
to proceed without the expected fixture text. This separates keyboard-layout
calibration/IME checks from the repeated-recreation result.
