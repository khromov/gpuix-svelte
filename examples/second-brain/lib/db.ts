import { Database } from 'bun:sqlite';

const MIGRATIONS = [
	`
CREATE TABLE items (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('text','link','image','audio')),
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  source_url  TEXT,
  file_blob   INTEGER,
  thumb_blob  INTEGER,
  width       INTEGER,
  height      INTEGER,
  duration    REAL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX items_url ON items(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX items_kind_created ON items(kind, created_at DESC);
CREATE INDEX items_created ON items(created_at DESC);
CREATE INDEX items_unfinished ON items(status) WHERE status <> 'ready';

-- Every byte the app owns. Rows are immutable: replacing an item's media inserts a new
-- row and drops the old one, which is what keeps cache/<id>.<ext> from ever going stale.
CREATE TABLE blobs (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('original','display','thumb','pcm')),
  ext        TEXT NOT NULL,
  size       INTEGER NOT NULL,
  bytes      BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (item_id, role)
);

CREATE TABLE chunks (
  id        INTEGER PRIMARY KEY,
  item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  idx       INTEGER NOT NULL,
  text      TEXT NOT NULL,
  embedding BLOB,
  UNIQUE (item_id, idx)
);

CREATE TABLE image_embeddings (
  item_id   INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  model     TEXT NOT NULL,
  embedding BLOB NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE VIRTUAL TABLE items_fts USING fts5(
  title, body, content='items', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER items_au AFTER UPDATE OF title, body ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO items_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
`
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function open_db(path: string): Database {
	const db = new Database(path, { create: true, strict: true });
	// Both only bite on a database with no tables yet, so they have to precede migrate():
	// bigger pages suit the media blobs, and without auto_vacuum a deleted image leaves
	// its pages behind forever.
	db.run('PRAGMA page_size = 8192');
	db.run('PRAGMA auto_vacuum = INCREMENTAL');
	// NORMAL is enough: the window closes by process.exit, not a power cut.
	db.run('PRAGMA journal_mode = WAL');
	db.run('PRAGMA synchronous = NORMAL');
	db.run('PRAGMA foreign_keys = ON');
	db.run('PRAGMA busy_timeout = 5000');
	db.run('PRAGMA temp_store = MEMORY');
	migrate(db);
	// Media moved into the `blobs` table without a migration, so a database from before that
	// is already at the current user_version and would fail on every query instead.
	if (!db.query<unknown, []>(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'blobs'`).get()) {
		throw new Error(`${path} predates the blob store — delete it (and the files/ and thumbs/ beside it) and start again`);
	}
	return db;
}

export function migrate(db: Database): number {
	let version = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
	while (version < MIGRATIONS.length) {
		const next = version + 1;
		db.transaction(() => {
			db.run(MIGRATIONS[version]);
			db.run(`PRAGMA user_version = ${next}`);
		})();
		version = next;
	}
	return version;
}
