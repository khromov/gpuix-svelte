# Changelog

## [0.1.0](https://github.com/khromov/gpuix-svelte/compare/v0.0.1...v0.1.0) (2026-09-03)


### ⚠ BREAKING CHANGES

* store Substrate's media in the database, and handle WAV/MP3 in-process ([#15](https://github.com/khromov/gpuix-svelte/issues/15))

### Features

* 24-hour clock in the liquid glass demos ([ae0c635](https://github.com/khromov/gpuix-svelte/commit/ae0c6354e1b05e60156aaa97e9a37f2faf2d9b4f))
* add liquid-glass example (blurred translucent window) ([dd3dc1b](https://github.com/khromov/gpuix-svelte/commit/dd3dc1b0ef89a511c03811f0a5bd73019ff5ff22))
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
* upgrade @gpuix/native to ^0.5.0 (resolves 0.5.1) ([08fecd9](https://github.com/khromov/gpuix-svelte/commit/08fecd936630ab60e8869afc05fb3071d726875e))
* window key events, editing flag, blur/focus helpers ([f4dad07](https://github.com/khromov/gpuix-svelte/commit/f4dad07f3c856c77978df1a3d26788c7aa40baef))


### Bug Fixes

* drain mutations on a microtask where there is no frame loop ([4ea2450](https://github.com/khromov/gpuix-svelte/commit/4ea2450d1d4cf83e7ce2d509656d5645ab8aba5d))
* **examples:** give the control center a real titlebar off macOS ([1c4b085](https://github.com/khromov/gpuix-svelte/commit/1c4b085cd23c06a520ae795451aa9fae43230676))
* fan the demo scripts out from node, not a POSIX shell ([8efb442](https://github.com/khromov/gpuix-svelte/commit/8efb442346c293dad7d4370f450766183ddbd520))
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
