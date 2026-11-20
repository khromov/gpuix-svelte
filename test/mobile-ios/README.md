# iOS mobile regressions

Build `examples/mobile` for the simulator, then run the hosted UIKit accessibility test:

```sh
IOS_SIMULATOR_UDID=<booted-udid> node test/mobile-ios/accessibility.mjs
```

This test inspects native accessibility elements and invokes their accessibility actions,
focuses a text input and inserts text through UIKit, checks filesystem and clipboard round trips, presents the system document picker and calls
its delegate to simulate cancellation and selection, and verifies URL handoff. It does not
operate the Files UI or VoiceOver, and it is not a physical-device test.

Use `test/txiki-ios/test.sh` for the txiki runtime integration test.
