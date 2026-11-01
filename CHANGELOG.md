# Changelog

## [0.4.1](https://github.com/khromov/gpuix-svelte/compare/v0.4.0...v0.4.1) (2026-11-01)


### Bug Fixes

* publishing issue ([ff40020](https://github.com/khromov/gpuix-svelte/commit/ff4002001d50aef1cca5a68334f86f1be3596d65))

## [0.4.0](https://github.com/khromov/gpuix-svelte/compare/v0.3.0...v0.4.0) (2026-10-31)


### Features

* build a real app per platform, with its metadata in render() ([#53](https://github.com/khromov/gpuix-svelte/issues/53)) ([9e1626e](https://github.com/khromov/gpuix-svelte/commit/9e1626e76a9050fd76b4d5f089bd1560ea8c4221))


### Bug Fixes

* gitignore .env in scaffolded apps ([0dffa53](https://github.com/khromov/gpuix-svelte/commit/0dffa537fe30d2c171533e6fda573cd60479ae17))
* render &lt;canvas&gt; as a div, since native 0.11 has no canvas element ([8ccd5ae](https://github.com/khromov/gpuix-svelte/commit/8ccd5ae8473985f49093bf7e004961f65264e72f))
* survive a native file picker on Windows and stop Scroller's idle redraws ([#55](https://github.com/khromov/gpuix-svelte/issues/55)) ([3dba6d6](https://github.com/khromov/gpuix-svelte/commit/3dba6d6f241bacbfdd8f89ca2c271da12a165661))
* update AGENTS.md ([ff75998](https://github.com/khromov/gpuix-svelte/commit/ff759982d04ecff7a393fee1acb95baa8dd63ae8))

## [0.3.0](https://github.com/khromov/gpuix-svelte/compare/v0.2.0...v0.3.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* Tab and Shift+Tab now move focus between tab stops once every key handler has run, and key events follow upstream's propagation rules. To migrate:
    - If your app moves focus on Tab itself (an `on_window_key('keydown', …)` handler calling `focus_next()` / `focus_previous()`), delete that code, or Tab moves focus twice. To keep handling Tab yourself instead, pass `render(App, { tabNavigation: false })`, and `mount_headless(App, { tabNavigation: false })` in tests that press Tab.
    - To keep a single Tab inside an element (to indent, say), call `e.preventDefault()` in its `onkeydown`.
    - `e.stopPropagation()` in an `onkeydown` now also keeps that keystroke from the focusable ancestors' handlers and from `on_window_key` handlers. Remove the call where a window shortcut must still fire.
    - Tab no longer types a tab character into `<input>` or `<textarea>`.
    - `get_native().getElementBounds()` now reports the border box, padding and border included. Drop any offset that made up for the old content box.
    - On Linux the native binding now loads `libxcb`, `libxkbcommon` and `libxkbcommon-x11`. Desktops ship them; a minimal container needs `apt install libxcb1 libxkbcommon0 libxkbcommon-x11-0`.
    - On GNOME under Wayland, `render()` now draws a 34px title bar above the app by default, and the app mounts in a box below it, which `rootStyle` styles. Pass `render(App, { titlebar: false })` to keep the bare window.

### Features

* `:focus-visible` rules and a `focus-visible="…"` attribute for keyboard focus styles, drawn with `outline-width`, `outline-color` and `outline-offset` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* `aspect-ratio`, `outline-*`, `scrollbar-color` / `scrollbar-width` (GPUI's own scrollbar), `border-style: dashed`, `align-items: stretch | baseline` and `justify-content: space-evenly` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* `onlayout` and `onscrollchange` events, and `<anchored fill="window">` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* `register_font(bytes)`, `elements_at(x, y)` and BGRA uploads through `set_image_pixels(node, w, h, pixels, 'bgra')` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* `render()` draws a title bar on GNOME under Wayland, which gives a GPUI window none: the title, minimise, maximise and close. It is the new `titlebar` option's default, `'auto'`; `false` turns it off and `true` draws it everywhere. It can't be dragged yet ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* **examples:** a native 0.11 demo of all of the above, `npm run demo:native-0.11` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* keyboard focus dim from native 0.11, off by default: `render(App, { keyboardFocusDim: true })` or `set_keyboard_focus_dim(true)` turns it on, and `keyboard-focus-dim: false` exempts an element ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* site ([#45](https://github.com/khromov/gpuix-svelte/issues/45)) ([8d48edd](https://github.com/khromov/gpuix-svelte/commit/8d48eddaa13a3af7895722369645928a1df30980))
* Tab and Shift+Tab move focus by default, as in `@gpuix/react` and `@gpuix/solid` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))


### Bug Fixes

* `hover:`, `active:` and `focus-visible:` written as declarations, and `aspect-ratio` lengths, are dropped with a warning instead of failing the whole frame ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* `render_hot` reloads edited components on Bun again; Bun 1.4.4 ignores the `?v=N` cache-buster, so a save re-rendered the old code ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* **examples:** the wheel scrolls a list nested in a scrolling page; GPUI scrolls every scroll area under the pointer, so give the inner one `pointer-events: auto` ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* open the window under X11 on Linux, not only under Wayland, by moving to `@gpuix/native` 0.11 ([#46](https://github.com/khromov/gpuix-svelte/issues/46)) ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))
* **test:** `focus()` and `unfocus()` fire `focus` and `blur` once each, now that the headless renderer reports them itself ([#49](https://github.com/khromov/gpuix-svelte/issues/49)) ([d103a6e](https://github.com/khromov/gpuix-svelte/commit/d103a6efe4b0497061468c92628add536ee25e52))

## [0.2.0](https://github.com/khromov/gpuix-svelte/compare/v0.1.1...v0.2.0) (2026-10-13)


### Features

* debugFrameOverlay render option and overlay wrappers ([#33](https://github.com/khromov/gpuix-svelte/issues/33)) ([c703d37](https://github.com/khromov/gpuix-svelte/commit/c703d371bf3694b6936587aa364639138b3fb548))
* drive a running app through gpuix-svelte/automation ([#40](https://github.com/khromov/gpuix-svelte/issues/40)) ([45e0cd1](https://github.com/khromov/gpuix-svelte/commit/45e0cd1acc3a6fcf82a316b446b3a5280f666240))
* drop tsx, publish compiled JS ([#42](https://github.com/khromov/gpuix-svelte/issues/42)) ([2acb704](https://github.com/khromov/gpuix-svelte/commit/2acb704f2ec5b6871a4d0537b2d26b916ba1a701))
* focus_next and focus_previous for whole-window tab order ([#43](https://github.com/khromov/gpuix-svelte/issues/43)) ([53fcfed](https://github.com/khromov/gpuix-svelte/commit/53fcfedf8ec60081b2586f9ccdf19be9415b86ca))
* map rem, overflow: auto and intrinsic sizes onto values GPUI takes ([#34](https://github.com/khromov/gpuix-svelte/issues/34)) ([03198de](https://github.com/khromov/gpuix-svelte/commit/03198de80eabbba556a65a27db7c77bb493c4bae))
* reactive window_size and window_insets ([#35](https://github.com/khromov/gpuix-svelte/issues/35)) ([870b057](https://github.com/khromov/gpuix-svelte/commit/870b057aab379d582233d095d87313f9913e370a))
* **test:** hover, mouse, wheel, drag, selection, clock and wait_for helpers ([#37](https://github.com/khromov/gpuix-svelte/issues/37)) ([b0a06ad](https://github.com/khromov/gpuix-svelte/commit/b0a06adb7d5a03d80f86bf0b413523ef5a477e53))
* TextSearch and find_ranges over native highlight ([#36](https://github.com/khromov/gpuix-svelte/issues/36)) ([96012d5](https://github.com/khromov/gpuix-svelte/commit/96012d5595ccf7a97b245e04a75263ca287a0c06))
* Tooltip and Popover components on native anchored ([#38](https://github.com/khromov/gpuix-svelte/issues/38)) ([19b75e1](https://github.com/khromov/gpuix-svelte/commit/19b75e16d39f97b669454706035a7b73bc267921))

## [0.1.1](https://github.com/khromov/gpuix-svelte/compare/v0.1.0...v0.1.1) (2026-10-12)


### Bug Fixes

* docs ([9475a0c](https://github.com/khromov/gpuix-svelte/commit/9475a0cfc5d02f641791fd91544a9a5f390edc38))
* docs ([ad1b041](https://github.com/khromov/gpuix-svelte/commit/ad1b04181072e238b7535d48a0fd03e68072fa7f))
* fix build ([4f6c938](https://github.com/khromov/gpuix-svelte/commit/4f6c9388c376d771ef5cb31905133f60ab95e4a9))

## [0.1.0](https://github.com/khromov/gpuix-svelte/compare/v0.0.1...v0.1.0) (2026-10-11)


### ⚠ BREAKING CHANGES

* store Substrate's media in the database, and handle WAV/MP3 in-process ([#15](https://github.com/khromov/gpuix-svelte/issues/15))

### Features

* 24-hour clock in the liquid glass demos ([ae0c635](https://github.com/khromov/gpuix-svelte/commit/ae0c6354e1b05e60156aaa97e9a37f2faf2d9b4f))
* add liquid-glass example (blurred translucent window) ([dd3dc1b](https://github.com/khromov/gpuix-svelte/commit/dd3dc1b0ef89a511c03811f0a5bd73019ff5ff22))
* add svelte-check ([b1e8629](https://github.com/khromov/gpuix-svelte/commit/b1e86296896f54556ecc9cb5392ca4773a6111d3))
* add tutorial app ([4339144](https://github.com/khromov/gpuix-svelte/commit/43391443a27852127ff2bc0510f224b5980f8dbb))
* amber highlight for the Focus pill ([d0148a9](https://github.com/khromov/gpuix-svelte/commit/d0148a90bcf7b97e4494b1c6691b261a20a7d2a7))
* bun run demo launches all four demos; counter moves to demo:counter ([a79943f](https://github.com/khromov/gpuix-svelte/commit/a79943fad36adfff01299150251b6900a3b8cd75))
* bun: script twins for every command, tested in CI ([e8c41aa](https://github.com/khromov/gpuix-svelte/commit/e8c41aac5f9898e3e46aabd9aa9f4ee2ded5d919))
* **examples:** keep liquid glass see-through without GPUI window blur ([397fa01](https://github.com/khromov/gpuix-svelte/commit/397fa01858d9290b8d625e35a5ee22a60fc912bc))
* experimental styling ([9a9329c](https://github.com/khromov/gpuix-svelte/commit/9a9329c604031dc66ab7f6e9fb484f18ed9756ae))
* gpuix-svelte bin runner ([0904d7e](https://github.com/khromov/gpuix-svelte/commit/0904d7e31dbdf69238d6514eea12b93c56fe3dea))
* gpuix-svelte/test harness and window helpers ([55a677b](https://github.com/khromov/gpuix-svelte/commit/55a677b1296828f9c1e31901437920fe1d618d73))
* hitbox="self" and &lt;svg&gt; colour inheritance ([1f6795d](https://github.com/khromov/gpuix-svelte/commit/1f6795d753c2a07e66e670a93cefbb684203a610))
* move counter into examples/counter, add tic-tac-toe and Hacker News examples ([8e6cc49](https://github.com/khromov/gpuix-svelte/commit/8e6cc49482f1bd9e56917eb7486f997f9677dcfa))
* npm release with the Svelte build bundled ([#12](https://github.com/khromov/gpuix-svelte/issues/12)) ([e729a86](https://github.com/khromov/gpuix-svelte/commit/e729a86b57ed965b56b43b28851835c1b7e6270c))
* one Include feeds switch for the timeline, search, Ask and Related ([#19](https://github.com/khromov/gpuix-svelte/issues/19)) ([b474c83](https://github.com/khromov/gpuix-svelte/commit/b474c83d250a0a25f64288d3e082867935df86e2))
* port the renderer to the @gpuix/native 0.6.0 contract ([592dceb](https://github.com/khromov/gpuix-svelte/commit/592dceb00613d2430c2cd90c9e60b8599c363a15))
* Portal component ([cf04c7e](https://github.com/khromov/gpuix-svelte/commit/cf04c7ed4beb6341544e501f72ff968d5064c8ea))
* prepare publish ([7a337fa](https://github.com/khromov/gpuix-svelte/commit/7a337fa6a5f78af24e12ba55eab48f83362808b2))
* real Liquid Glass (NSGlassEffectView) in the control center demo ([693ece0](https://github.com/khromov/gpuix-svelte/commit/693ece01582d7ba156be3504af40b01d2bf63117))
* RSS feeds for Substrate, polled on a schedule and out of search by default ([#16](https://github.com/khromov/gpuix-svelte/issues/16)) ([e396b44](https://github.com/khromov/gpuix-svelte/commit/e396b44eb95486b7fad5d10da9062f1bdb6b5f00))
* run on Node.js, with Node as the default runtime ([9ddd5de](https://github.com/khromov/gpuix-svelte/commit/9ddd5de28146e075743bd86a09ef33722864f1d7))
* runtime CSS variables in &lt;style&gt; rules ([24bd9c6](https://github.com/khromov/gpuix-svelte/commit/24bd9c68367919e8f18626ddeea72a2f0b4c91da))
* second brain app ([32e9597](https://github.com/khromov/gpuix-svelte/commit/32e95971f6693ff239295dfd595fd50f9c2a8b3e))
* second brain app ([e6385c4](https://github.com/khromov/gpuix-svelte/commit/e6385c4420c068d0d8c4632389791997a15ff2b9))
* ship Scroller as gpuix-svelte/components/Scroller.svelte ([c0423b1](https://github.com/khromov/gpuix-svelte/commit/c0423b1aa04e843635ff7102ef792a4d8952025d))
* split liquid glass into plain and FFI demos ([8bc77b0](https://github.com/khromov/gpuix-svelte/commit/8bc77b06e7a06ebedaf309ad7345d1da0a9b304e))
* standalone gpuix-svelte, extracted from the khromov/gpuix fork ([b12443c](https://github.com/khromov/gpuix-svelte/commit/b12443c3f25995a3f350b3ee6f01b83f0c7113e8))
* store Substrate's media in the database, and handle WAV/MP3 in-process ([#15](https://github.com/khromov/gpuix-svelte/issues/15)) ([4a177bd](https://github.com/khromov/gpuix-svelte/commit/4a177bd998a0985e1e755a7e28b61b44e7f7e0fd))
* update to latest gpuix ([cd7a92f](https://github.com/khromov/gpuix-svelte/commit/cd7a92f0214a280afcabb3f21dff11554665bffb))
* upgrade @gpuix/native to ^0.5.0 (resolves 0.5.1) ([08fecd9](https://github.com/khromov/gpuix-svelte/commit/08fecd936630ab60e8869afc05fb3071d726875e))
* window key events, editing flag, blur/focus helpers ([f4dad07](https://github.com/khromov/gpuix-svelte/commit/f4dad07f3c856c77978df1a3d26788c7aa40baef))


### Bug Fixes

* cap @gpuix/native below 0.8.0, whose getElementBounds returns an object ([#22](https://github.com/khromov/gpuix-svelte/issues/22)) ([7e6074d](https://github.com/khromov/gpuix-svelte/commit/7e6074dfdc387a62f9bf053bcb9439de6bdad019))
* drain mutations on a microtask where there is no frame loop ([4ea2450](https://github.com/khromov/gpuix-svelte/commit/4ea2450d1d4cf83e7ce2d509656d5645ab8aba5d))
* **examples:** give the control center a real titlebar off macOS ([1c4b085](https://github.com/khromov/gpuix-svelte/commit/1c4b085cd23c06a520ae795451aa9fae43230676))
* fan the demo scripts out from node ([8efb442](https://github.com/khromov/gpuix-svelte/commit/8efb442346c293dad7d4370f450766183ddbd520))
* **hot:** cache-bust dynamic and side-effect .svelte imports ([78bfcd0](https://github.com/khromov/gpuix-svelte/commit/78bfcd0d7fda71c1324c6a0feb05f1b4b8aebb6e))
* import through a file:// URL in render_hot ([4dbe3e2](https://github.com/khromov/gpuix-svelte/commit/4dbe3e2f3258d0615cc9ee7fa25bc9edb7d1a929))
* keep the window's own plumbing alive through a throw ([7dc3e06](https://github.com/khromov/gpuix-svelte/commit/7dc3e06532f3d6aa50df29031b10a6d1be42c5f5))
* liquid-glass toggles, knob animation, and slider dragging ([22e544a](https://github.com/khromov/gpuix-svelte/commit/22e544ac01d9074f94edbb00986b7fd378ec7a10))
* **renderer:** correct what a node leaves behind when it stops being native ([c71505e](https://github.com/khromov/gpuix-svelte/commit/c71505ea8a8de1daa6505e7047e2e6c21f0ef3f3))
* review findings for the renderer, Scroller and Substrate ([c68834b](https://github.com/khromov/gpuix-svelte/commit/c68834b2eafca3efe18068c865af64ed3641e9a6))
* **style:** expand CSS box shorthands instead of throwing at commit ([5ba6f78](https://github.com/khromov/gpuix-svelte/commit/5ba6f785189d7ba2af8632c838929c644fcbe8d1))
* **test:** resolve the compile fixture with fileURLToPath ([ee1d618](https://github.com/khromov/gpuix-svelte/commit/ee1d61818888820beb622dc58245e725ed4d9a65))
* **test:** write the headless screenshot to the platform temp dir ([718ffdf](https://github.com/khromov/gpuix-svelte/commit/718ffdf26fc65f51ff38d78bc97be4f095203832))


### Performance Improvements

* one &lt;markdown&gt; row per block on Substrate's item view ([#14](https://github.com/khromov/gpuix-svelte/issues/14)) ([e757155](https://github.com/khromov/gpuix-svelte/commit/e75715524aecec3f4d4a24411c9b3a0c982acf09))
