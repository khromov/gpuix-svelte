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

Use `test/txiki-android/app-test.py` for the txiki runtime integration and lifecycle test.
