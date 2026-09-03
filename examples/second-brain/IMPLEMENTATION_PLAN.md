# Substrate Sync: implementation plan

| | |
|---|---|
| Scope | a sync engine inside Substrate (endpoint + secret key in Settings) and a hosted, multi-tenant sync server; both run on Bun |
| Model | row-level sync over a client-side change log, originals content-addressed by SHA-256, last-writer-wins on an edit clock |
| Out of scope | billing, a web UI over the hosted data, end-to-end encryption (the protocol leaves room for it, see "Later") |
| Files | as of `a0fe07f` |

## Goal

A user pastes an endpoint URL and a secret key into Settings. From then on every capture, edit
and delete on this machine reaches the server within seconds when online and queues when
offline; a second machine linked with the same key converges to the same items with the same
originals. The server holds the canonical copy per user and can hand it back as one SQLite
file. Search, ML and the UI stay entirely local; the server never reads a body for anything
but storage.

## Decisions

1. **Row-level, not page- or WAL-level.** A hosted copy that several devices write to has to
   merge rows; WAL shipping replicates exactly one writer. (Litestream remains the right tool
   for backing up the *server's* own SQLite files, see "Deploy".)
2. **The unit of sync is an item plus its `original` blob.** Everything else is derived and is
   recomputed by the receiving device through the ingest pipeline it already has: `display`,
   `thumb` and `pcm` blobs, chunks, embeddings, the FTS index, `status`/`attempts`/`error`.
3. **Identity is `items.uid`, a UUIDv7** (`Bun.randomUUIDv7()`, both sides are Bun). The integer
   rowid stays local: the FTS external-content table and the cascades need it, and integer
   ids collide across devices. UUIDv7 sorts by creation time, which is what settles the
   same-link-captured-twice case below.
4. **The clock is `items.edited_at`**, milliseconds, set by the store only on content writes.
   `updated_at` keeps meaning "last activity" for the UI. Conflicts resolve last-writer-wins
   on `edited_at`; ties go to the lexically smaller device id. A delete is a state under the
   same rule, not a trump card: an offline edit newer than a delete resurrects the item, because
   silently losing an edit is worse than bringing a note back.
5. **The change log is written by the store, not by triggers.** `create_store` in
   [`lib/store.ts`](lib/store.ts) is already the single write path, and the rule for what
   counts as content involves JSON keys inside `meta` that read better in TypeScript than in a
   trigger `WHEN` clause.
6. **Blobs are keyed by SHA-256 and stored per user.** Uploaded once per user, never
   cross-user deduplicated: quota accounting and account deletion stay trivial, and nothing
   about one user's data is observable from another's.
7. **Server storage is one control-plane SQLite plus one SQLite file and one blob directory per
   user.** Export is `VACUUM INTO`, deletion is `rm -rf`, and no query can reach across
   tenants because there is no table that holds two of them.
8. **Transport is HTTPS + JSON with a bearer key; blobs travel as raw bodies.** No websockets
   in v1: push-on-change plus a poll every few minutes is plenty for a personal tool, and a
   long-poll can be added behind the same `pull` call later.
9. **The server has zero dependencies**: `Bun.serve`, `bun:sqlite`, `Bun.CryptoHasher`,
   `Bun.file`. It compiles to one binary with `bun build --compile` (unlike the ML worker,
   nothing here resists compilation).

## What syncs and what does not

| Data | Syncs | Why |
|---|---|---|
| `items`: `uid`, `kind`, `title`, `body`, `source_url`, `created_at`, `edited_at`, tombstone | yes | user content |
| `items.meta` content keys: `auto_title`, `original_name`, `format`, `summary`, `summarized_by`, `described_by`, `site_name`, `canonical_url`, `excerpt`, `lang`, `og_image`, `final_url`, `fetched_at`, `truncated`, `empty`, `recorded`, `segments`, `language` | yes | scrape results, transcripts and summaries are expensive or impossible to recompute identically |
| `items.meta` local keys: `pcm_blob`, `display_blob`, `thumb_width`, `thumb_height`, `compacted`, `embed_model`, `embedded_at`, `describe_error` | no | local blob ids and processing markers |
| `items`: `status`, `error`, `attempts`, `file_blob`, `thumb_blob`, `width`, `height`, `duration` | no | processing state and local ids; `width`/`height`/`duration` are re-derived with the thumb and the PCM |
| `blobs` with role `original` | yes, by hash | the bytes the user gave us |
| `blobs` with roles `display`, `thumb`, `pcm` | no | derived from the original |
| `chunks`, `image_embeddings`, `items_fts` | no | derived; the FTS triggers maintain themselves on applied rows |
| `settings` | not in v1 | see "Later"; `llm.apiKey` and `sync.*` never sync in any version |
| `feeds` (the RSS work in flight on this branch, uncommitted at `a0fe07f`) | not in v1 | subscriptions are user content and get a `uid` and the same LWW rule in "Later"; `feed_entries` is local dedupe state and `items.feed_id` maps to the feed's `uid` on the wire; its `meta.feed`, `meta.author`, `meta.edited` are content keys from day one |

The wire form of an item is therefore:

```ts
interface WireItem {
	uid: string;                                  // UUIDv7
	kind: 'text' | 'link' | 'image' | 'audio';
	title: string;
	body: string;
	source_url: string | null;
	original: { hash: string; ext: string; size: number } | null;
	meta: WireMeta;                               // the content keys above, nothing else
	created_at: number;
	edited_at: number;                            // the LWW clock
	deleted: boolean;
}
```

## Protocol v1

All routes are under `/v1`, take `Authorization: Bearer <key>` and answer JSON except the blob
bodies. The client refuses a plain `http://` endpoint unless the host is loopback, so tests and
self-hosters work and nobody ships a key in clear across a café.

| Route | Request | Response |
|---|---|---|
| `GET /v1/me` | | `{ user, quota_bytes, bytes_used, version, devices: [...] }`; also the "does this key work" probe the Settings page uses |
| `POST /v1/devices` | `{ device, name }` | registers or renames this device |
| `POST /v1/push` | `{ device, rows: WireItem[] }`, at most 200 rows / 4 MB | `{ applied: uid[], stale: uid[], missing: { uid, hash }[], version }` |
| `GET /v1/pull?since=<version>&limit=500` | | `{ rows: (WireItem & { version, device })[], version, more }` |
| `HEAD /v1/blobs/:hash` | | 200 or 404 |
| `PUT /v1/blobs/:hash` | raw bytes, `Content-Length` required | 201, or 422 if the bytes do not hash to the path |
| `GET /v1/blobs/:hash` | | the bytes, streamed from `Bun.file` |
| `GET /v1/export` | | the user's hosted SQLite, `VACUUM INTO` a temp file streamed and deleted (phase 5) |

Errors: 401 unknown key, 403 revoked key or suspended user, 409 `{ error: 'resync' }` when
`since` is older than the tombstone horizon, 413 body over the blob limit, 429 rate limited,
507 over quota. Every response carries `X-Substrate-Version: 1`; a client that sees a higher
major stops and tells the user to update.

**Push, server side**, one transaction per request, one decision per row:

1. Look up the row by `uid`. If it exists and its `edited_at` is newer than the incoming one
   (or equal with a smaller device id), answer `stale` and change nothing. The winning row
   comes back to the pushing device on its next pull.
2. If the row references an `original` whose hash is not in the user's blob store, answer
   `missing` and change nothing. The client uploads and resends.
3. Otherwise upsert the content columns, set `version` to the user's incremented counter and
   `device` to the pusher. A row with `deleted: true` sets `deleted_at` and clears `original`.

**Pull, server side**: rows with `version > since`, ordered by version, page of `limit`,
tombstones included. The client drops rows whose `device` is its own.

The whole cycle, from the client's point of view:

```
hash originals that still lack one (batched, idle)
push  → upload every `missing` hash, resend those rows
      → drop change-log entries up to the acked seq (a `stale` row is dropped too:
        the server's version arrives on the pull below and overwrites)
pull  → apply each page in one transaction under the "applying" guard
      → queue downloads for originals not in the local blob table
      → hand every applied item to the ingestor as `pending`
store the cursor; emit a `sync` bus event for the UI
```

## Client

### Schema, the next entry in `MIGRATIONS` in [`lib/db.ts`](lib/db.ts)

(Numbered after whatever the feeds migration lands as; the sync migration has no ordering
dependency on it beyond `items.feed_id` existing or not.)

```sql
ALTER TABLE items ADD COLUMN uid TEXT;            -- backfilled with UUIDv7 in the migration
ALTER TABLE items ADD COLUMN edited_at INTEGER;   -- backfilled from updated_at
CREATE UNIQUE INDEX items_uid ON items(uid);
ALTER TABLE blobs ADD COLUMN hash TEXT;           -- nullable; filled by put() from now on,
CREATE INDEX blobs_hash ON blobs(hash);           -- backfilled lazily (see Blobs)
CREATE TABLE sync_changes (seq INTEGER PRIMARY KEY, uid TEXT NOT NULL);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- device, cursor, applying
CREATE TABLE sync_downloads (uid TEXT PRIMARY KEY, hash TEXT NOT NULL, ext TEXT NOT NULL,
                             size INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
```

`sync_changes` holds one row per change; the push query takes `max(seq)` per `uid`, so a
note edited fifty times offline is one row on the wire. Nothing in the migration reads blob
bytes, so opening a multi-gigabyte database stays instant.

### Store, [`lib/store.ts`](lib/store.ts)

- `insert_item` stamps `uid` and `edited_at`; `update_item` stamps `edited_at` and logs a
  change only when the patch touches content: `title`, `body`, `source_url`, `file_blob`,
  or a `meta` key from the content list. A `set_status`, a thumb, `attempts`, a local meta
  key: no log entry, no clock bump. `delete_item` logs the `uid` before the row goes.
- New, non-logging methods for the sync engine: `get_item_by_uid`, `apply_remote(row)` (upsert
  content columns, preserve local ones, merge `meta` so local keys survive), `adopt_original(
  uid, blob_id)` (sets `file_blob` and `duration`/`width`/`height` to null so ingest
  re-derives them), `changes_since(seq)`, `ack_changes(seq)`, and a `sync_state` getter/setter.
- `PATCHABLE` grows `uid` and `edited_at` only for `apply_remote`; the public `update_item`
  refuses both.
- The push query gates on status: an item goes out once it is `ready` or `error`, or once it
  has sat `pending` for a minute (ML switched off, so nothing is coming). This is what keeps a
  freshly recorded WAV off the wire until `compact` has replaced it with the MP3, and a link's
  empty pre-scrape row from racing another device's scrape.

### Blobs, [`lib/blobs.ts`](lib/blobs.ts)

- `put` hashes the bytes with `Bun.CryptoHasher('sha256')` before the insert. A 50 MB import
  costs on the order of 100 ms on the main thread, which is acceptable at capture; if it ever
  is not, the hash moves to the ML worker alongside the decode it already does.
- A `backfill_hashes(limit)` method hashes `original` rows with a null `hash`, oldest first;
  the sync engine calls it in batches before a push. `display`/`thumb`/`pcm` rows never need
  a hash and are left null.
- `find_by_hash(hash)` for the pull side, so an original the device already holds (the same
  file captured on both machines) is adopted rather than downloaded.

### Engine, `lib/sync.ts` (new)

`create_sync({ store, blobs, settings, bus, fetch })`, created in `create_app`
([`lib/app.ts`](lib/app.ts)) next to the ingestor, and taking the same injected `fetch` so
tests can bind it to an in-process server. Exposes `status`, `sync_now()`, `link(url, key)`,
`unlink()`, `start()`, `stop()`.

- **Triggers**: `bus` item events with `added`/`updated`/`deleted` debounce into a push 3 s
  later; a timer pulls every 5 min; `start()` syncs once at launch; `sync_now()` is the
  button. One cycle runs at a time; a trigger during a cycle marks it to run again.
- **Apply**, per pulled row, inside one transaction per page with `sync_state.applying` set so
  nothing in the transaction logs a change:
  - own device: skip. Local `edited_at` newer than the row's: skip (our edit is in the log
    and will win on push).
  - `deleted`: `delete_item` if present, silently.
  - `source_url` collides with a local item of a different `uid` (both machines captured the
    same link before either synced): the older UUIDv7 survives on both sides, the newer is
    deleted locally and a tombstone for it is logged. Every device runs the same rule, so they
    converge without the server knowing about URLs.
  - otherwise `apply_remote`; if `original` is set and `find_by_hash` hits, `adopt_original`
    now, else insert into `sync_downloads`. Then the ingestor's retry path (`attempts` reset,
    `pending`) so `plan()` derives what is missing.
- **Downloads**: two at a time, from `sync_downloads`; verify the hash of the received bytes,
  `put` as `original`, `adopt_original`, re-enqueue for ingest; a failure increments
  `attempts` and backs off. The item is visible in the timeline from the moment its row lands,
  with a placeholder where the thumb will be.
- **Status**: a new `BusEvent` `{ type: 'sync', state: 'off' | 'idle' | 'syncing' | 'offline'
  | 'error', pending: number, last_at: number | null, error?: string }`, emitted on every
  transition, consumed by the UI below.
- **Resync**: on 409 the cursor resets to 0 and everything is pulled again. Rows already held
  are cheap to re-apply, and blobs never re-download because `find_by_hash` hits.

### Ingest, [`lib/ingest.ts`](lib/ingest.ts) and [`lib/app.ts`](lib/app.ts)

- The thumb and display copy are made inside `add_image` today, not by the pipeline. Move
  that into a `thumb` step the ingestor runs whenever an image item has a `file_blob` but no
  `thumb_blob`, so capture and sync share it. `add_image` keeps its synchronous feel by
  enqueueing straight away.
- `plan()` skips the media steps (`thumb`, `convert`, `describe`, `clip`) while `file_blob`
  is null and a `sync_downloads` row exists for the item; the download's completion
  re-enqueues.
- `compact` on a pulled recording is effectively a no-op: `pcm_blob` is unset and the original
  is already the MP3 (or a WAV that did not shrink, which it re-tries harmlessly). The step
  still runs once to stamp `compacted` locally.
- Everything else already behaves: `scrape` only runs without a `body`, `transcribe` only
  without a `body`, `embed` always, and the FTS triggers fire on the applied row.

### Settings and UI

- Two `SETTINGS` entries in [`lib/settings.ts`](lib/settings.ts): `sync.url` (env
  `GPUIX_BRAIN_SYNC_URL`) and `sync.key` (env `GPUIX_BRAIN_SYNC_KEY`, `secret: true`), plus
  `sync.device` (generated on link, never from env). The key sits in the settings table in
  plain text exactly like `llm.apiKey` does today, with the same hint under the field.
- A **Sync** section in [`routes/Settings.svelte`](routes/Settings.svelte) between LLM and
  Storage: endpoint and key fields, a "Test" button hitting `/v1/me`, the state line (last
  sync, pending changes, bytes used of quota, this device's name), "Sync now", and "Unlink"
  behind a `Modal` that explains local data stays put.
- A small status indicator in [`components/Sidebar.svelte`](components/Sidebar.svelte): a
  dot that is grey (off), green (idle), pulsing (syncing), amber (offline), red (error, with
  the message as a toast once).

### Tests

`test/sync.ts`, Bun only like `test/brain.ts`, chained into `bun:test` as `test:sync` with a
`bun:test:sync` alias, no models and no network:

- pure functions: wire validation, the LWW decision, change coalescing, the meta projection
  and merge, the URL-collision rule.
- the server against `Bun.serve({ port: 0 })`: auth, push/pull semantics, `missing` and
  `stale`, blob hash verification, 409 after a prune, 507 over quota, revoked key.
- the integration that matters: two `create_app` instances in temp dirs with `MlStub` and
  `fetch` bound to the same in-process server. Text added on A appears on B; both edit the
  same note offline and the newer edit wins on both; a delete on A against a later edit on B
  resurrects on A; an image on A reaches B with its original, and B derives a thumb; the same
  link captured on both converges to one item; unlinking B and relinking a fresh directory
  rebuilds it from the server; a 409 resync ends in the same state.

## Server

### Layout

```
examples/second-brain/server/
  main.ts        Bun.serve, routing, auth middleware, limits
  control.ts     control-plane SQLite: users, keys, devices, usage
  tenant.ts      one SQLite per user: items, blobs index, version counter
  blobs.ts       content-addressed files under <data>/users/<id>/blobs/<aa>/<hash>
  protocol.ts    re-exports ../lib/sync-protocol.ts (the shared wire types and validators)
  admin.ts       CLI: create-user, issue-key, revoke-key, quota, usage, delete-user
  gc.ts          tombstone pruning and unreferenced-blob removal
```

The shared wire module lives at `lib/sync-protocol.ts`, pure TypeScript with no imports
from the app, so the server never pulls the renderer or `gpuix-svelte` in. Root `tsconfig`
already includes `examples`, so the server is typechecked by `npm run typecheck` with no
change. Root scripts: `sync:serve` (`bun examples/second-brain/server/main.ts`),
`sync:admin`, `sync:compile`. Being Bun-only they get no `node` twin, like `brain:*`.

### Control database, `<data>/control.sqlite`

```sql
users   (id TEXT PRIMARY KEY, email TEXT UNIQUE, created_at, quota_bytes, status)   -- active | suspended
keys    (id TEXT PRIMARY KEY, user_id, hash TEXT UNIQUE, label, created_at, last_used_at, revoked_at)
devices (id TEXT PRIMARY KEY, user_id, name, first_seen, last_seen, last_version)
usage   (user_id TEXT PRIMARY KEY, db_bytes, blob_bytes, updated_at)
```

A key is `sub_` plus 32 random bytes base64url, shown once by `admin.ts issue-key` and stored
as its SHA-256; lookup by hash makes timing comparisons moot. One account key per user in v1
(what the user asked for: an endpoint and a secret); several keys per user is already a row
away when device-scoped keys are wanted.

### Tenant database, `<data>/users/<id>/brain.sqlite`

```sql
items (uid TEXT PRIMARY KEY, kind, title, body, source_url, meta TEXT, created_at, edited_at,
       deleted_at, original_hash, original_ext, original_size, version INTEGER NOT NULL, device TEXT NOT NULL);
CREATE INDEX items_version ON items(version);
blobs (hash TEXT PRIMARY KEY, size INTEGER NOT NULL, created_at);
meta  (key TEXT PRIMARY KEY, value);     -- version counter, schema version, pruned_before
```

Opened lazily per request and cached in a small LRU of open handles; WAL mode and
`busy_timeout` like the app. Bun is single-threaded and a push transaction contains no
`await`, so one user's pushes serialize without locks and two users never touch the same
file.

### Blob store

`PUT` streams the body into `<hash>.part` while hashing, compares, then renames into place;
a mismatch deletes the part and answers 422. `HEAD` is a `stat`. `GET` returns
`new Response(Bun.file(path))` so Bun does the streaming and ranges. The hash in the path is
validated as 64 hex characters before it touches a filesystem call. Quota is checked against
`Content-Length` before the first byte is read, and `usage` is updated on every successful
write and delete.

### Retention and GC

`gc.ts` runs from a timer in `main.ts` (and by hand from `admin.ts`):

- tombstones older than 90 days are deleted and `meta.pruned_before` set to the highest
  version removed; a pull with `since` below it gets 409.
- blobs referenced by no live item for 7 days are deleted. A push that references one again
  simply gets `missing` and the client re-uploads: the system heals itself instead of
  needing reference counts.
- `PRAGMA incremental_vacuum` on tenant files after a prune, as the app does.

Accepted limitation: a device offline longer than the tombstone window will not learn about
deletes made in that time. After its 409 resync those items linger on that device only, since
nothing logs a change for them, but editing one there pushes it back as a new row for
everyone. Deleting them again by hand is the remedy. Documented in README when built.

### Limits and abuse

`maxRequestBodySize` for blob routes from `SUBSTRATE_SYNC_MAX_BLOB` (default 256 MB); JSON
routes capped at 4 MB. A per-key token bucket in memory (600 requests a minute) answers 429.
Logs carry the key id, never the key. Suspending a user answers 403 to every route without
touching their files.

### Deploy

`bun build --compile server/main.ts --outfile dist/substrate-sync`: `bun:sqlite` embeds
fine, so the artifact is one binary plus a data directory. Env: `SUBSTRATE_SYNC_DIR`,
`SUBSTRATE_SYNC_PORT`, `SUBSTRATE_SYNC_MAX_BLOB`. Run under systemd behind Caddy for TLS on
any VPS with a persistent disk. Backups: Litestream over `control.sqlite` and the tenant
files (plain SQLite in WAL mode, so the one-writer WAL-shipping tool is exactly right on
this side), or a nightly `VACUUM INTO` of each tenant to object storage. Blob directories go
to object storage with `rclone` or an S3-backed `blobs.ts` in a later phase.

## Phases

| Phase | Deliverable | Depends on | Size |
|---|---|---|---|
| 1 | `lib/sync-protocol.ts`; the sync migration; store logging, `edited_at`, the non-logging apply methods; blob hashing and backfill; unit tests | nothing | S, 1 to 2 days |
| 2 | the server: control and tenant databases, all routes, admin CLI, its tests against `Bun.serve` | 1 (the protocol module) | M, 3 to 4 days |
| 3 | `lib/sync.ts`: push, pull, apply, downloads; the ingest changes; the two-app integration test | 1, 2 | M, 3 to 5 days |
| 4 | Settings section, sidebar indicator, toasts, env vars, README and CLAUDE.md entries | 3 | S, 1 to 2 days |
| 5 | GC, quotas, rate limit, `/v1/export`, compile script, deploy notes, running instance | 2, 3 | M, 2 to 3 days |

Phases 1 and 2 can proceed in parallel once the protocol module is written; 3 is where the
design meets reality, so the integration test is written first and the engine to it.

## Risks and open questions, with the default taken

- **Clock skew between devices** makes LWW pick a loser wrongly. Default: accept for v1, the
  edit window that matters is minutes and skew is seconds on machines that sync time. A
  hybrid logical clock (server-issued time folded into `edited_at`) is a drop-in later.
- **Large originals** (a two-hour recording, a 200 MB import) hit the single-`PUT` limit.
  Default: raise the cap and accept whole-blob retries in v1; a chunked upload with
  `Content-Range` is phase 6 if anyone hits it.
- **Re-embedding on every pulled edit** costs ML time on the receiving device. Default:
  accept, it is what a local edit costs too; syncing chunk embeddings as derived bulk keyed
  by `(uid, embed_model)` is in "Later".
- **Two accounts, one directory**: relinking a directory to a different key. Default:
  refuse unless the local database is empty, with the Settings copy explaining why.
- **Where the key lives**: in the settings table in clear, like the LLM key. Default: keep
  parity now; the macOS keychain via the existing `bun:ffi` shim path is a self-contained
  follow-up for both keys.
- **Bootstrap of a large brain on a new device** pulls every body over JSON. Default: fine
  up to tens of thousands of items; `/v1/export` plus "restore from the hosted copy" is the
  fast path in phase 5.

## Later

- **End-to-end encryption.** `WireItem` grows `ciphertext`/`nonce` in place of `title`,
  `body`, `meta`, and originals are encrypted before hashing, so the server stores and
  serves without ever holding a key. Nothing on the server changes shape, which is why the
  server does no search: the design already assumes it cannot read the data.
- **Originals on demand.** Keep thumbs locally, fetch the original when an item is opened,
  and let the user cap the local cache. The blob route and `sync_downloads` are already the
  right primitives; it is a policy on top.
- **Settings sync** for `theme.mode`, `ml.autoload`, `stt.language`, `llm.baseUrl`,
  `llm.model`, `llm.visionModel`: a second table on the wire with `key` as the identity and
  the same LWW rule. Never `llm.apiKey`, never `sync.*`.
- **Derived bulk**: chunk embeddings and image embeddings as an optional, conflict-free
  table keyed by `(uid, model)`, so a second device skips the ML on a big corpus.
- **Long-poll `pull`** for near-instant propagation between two machines that are both awake.
- **Device-scoped keys** and a "devices" list with revoke, from the `keys`/`devices` rows
  that already exist.
