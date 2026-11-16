import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const DEFAULT_DB_PATH = '.data/site.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('dir', 'file')),
  content     TEXT,
  size        INTEGER,
  hidden      INTEGER NOT NULL DEFAULT 0,
  readonly    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_parent_name ON nodes (parent_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS nodes_parent ON nodes (parent_id);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  ip          TEXT
);
`

let db: Database.Database | null = null

/**
 * Returns the process-wide SQLite connection, creating the database file,
 * schema and drive root (`C:`) on first use.
 *
 * @returns {Database.Database}
 * @throws {Error} When the database file cannot be opened or created.
 * @example
 *   const row = useDb().prepare('SELECT count(*) AS n FROM nodes').get()
 */
export const useDb = (): Database.Database => {
  if (db) return db
  const path = resolve(useRuntimeConfig().dbPath || DEFAULT_DB_PATH)
  mkdirSync(dirname(path), { recursive: true })
  const connection = new Database(path)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  connection.exec(SCHEMA)
  const columns = (connection.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map((c) => c.name)
  if (!columns.includes('blob_key')) connection.exec('ALTER TABLE nodes ADD COLUMN blob_key TEXT')
  if (!columns.includes('mime')) connection.exec('ALTER TABLE nodes ADD COLUMN mime TEXT')
  const root = connection.prepare('SELECT id FROM nodes WHERE parent_id IS NULL').get()
  if (!root) {
    connection.prepare("INSERT INTO nodes (parent_id, name, type) VALUES (NULL, 'C:', 'dir')").run()
  }
  db = connection
  return db
}
