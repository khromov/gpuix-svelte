# Migration guide

What to change when a release of `gpuix-svelte` needs more than a version bump. Each entry ends with
instructions you can paste to a coding agent.

## 0.6 to 0.7

Svelte 5.59 ships [custom renderers](https://svelte.dev/docs/svelte/custom-renderers), so
`gpuix-svelte` no longer bundles a Svelte build of its own. Two things change:

- `svelte` is a peer dependency, 5.59.1 or later, that your app installs.
- The export condition is `svelte-custom-renderer` instead of `custom-renderer`.

**For most apps, installing is the whole upgrade:**

```bash
npm install gpuix-svelte@^0.7.0 svelte@^5.59.1
# or: bun add gpuix-svelte@^0.7.0 svelte@^5.59.1
```

An app made with `create-gpuix-svelte` keeps working after that. The first time you run
`npm start` or `npm test`, the bin also updates `tsconfig.json` and `AGENTS.md` where they still
have what the starter wrote, and prints one line saying so. Review the change and commit it.

**Fix these by hand if your app has them:**

- **`custom-renderer` set anywhere the bin doesn't cover:** a script that runs `node` or `bun`
  with `--conditions custom-renderer`, a bundler config, a condition in a `package.json` `imports`
  or `exports` map, or a tsconfig you have edited. Rename it to `svelte-custom-renderer`. A script
  without it stops with `custom_renderer_unavailable_on_server`, but a tsconfig still typechecks
  quietly, against the browser build.
- **A `svelte` pinned below 5.59.1 in `package.json`:** raise it. npm refuses the install with
  `ERESOLVE` otherwise.
- **tsconfig `paths` entries pointing into `node_modules/gpuix-svelte/node_modules/svelte`:**
  delete them. That copy no longer exists.
- **`getAbortSignal()` called after an `await`:** move the call above the first `await`. The bundled
  build was Svelte 5.57.2, and 5.58.1 made this an error in async mode, which gpuix-svelte compiles
  every component in. [Svelte's changelog](https://github.com/sveltejs/svelte/blob/main/packages/svelte/CHANGELOG.md)
  has the rest of what changed since 5.57.2.

### Paste this to your agent

```
Upgrade this app from gpuix-svelte 0.6 to 0.7. gpuix-svelte no longer bundles
Svelte: svelte 5.59.1 or later is now a peer dependency the app installs, and the
package's export condition is `svelte-custom-renderer` instead of
`custom-renderer`. Running the app once may already have updated tsconfig.json
and AGENTS.md, so check `git diff` first.

1. Install: `npm install gpuix-svelte@^0.7.0 svelte@^5.59.1` (with Bun:
   `bun add gpuix-svelte@^0.7.0 svelte@^5.59.1`). If package.json pins svelte
   to an older version, raise it.
2. In every tsconfig, change "custom-renderer" to "svelte-custom-renderer" in
   compilerOptions.customConditions. Delete the "svelte" and "svelte/*" entries
   in compilerOptions.paths that point into
   node_modules/gpuix-svelte/node_modules/svelte, and delete "paths" if nothing
   is left in it.
3. Rename every other use of the `custom-renderer` condition to
   `svelte-custom-renderer`: `--conditions custom-renderer` in package.json
   scripts, shell scripts, CI workflows and docs, `conditions` lists in bundler
   configs, and condition keys in package.json "imports" and "exports" maps.
4. Find every getAbortSignal() call. Svelte 5.58.1 made calling it after an
   `await` an error, so move each call above the first `await` in its function.
5. In AGENTS.md or CLAUDE.md, remove any advice to keep svelte out of
   package.json.
6. Run `npm run typecheck` and `npm test` (or their Bun equivalents) and fix
   what they report.
```
