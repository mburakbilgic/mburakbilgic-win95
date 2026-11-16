import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const BLOB_MAX_BYTES = 15 * 1024 * 1024
const BLOB_KEY_PATTERN = /^[a-f0-9]{64}$/
const BLOB_URL_VERSION_LENGTH = 12

const SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
]

/**
 * Detects the file type from its leading bytes (never from the client's
 * declared type or extension), limited to the formats the site serves.
 *
 * @param {Buffer} data
 * @returns {string | null} MIME type, or null when unsupported.
 * @example
 *   sniffMime(buffer) // → 'image/jpeg'
 */
export const sniffMime = (data: Buffer): string | null => SIGNATURES.find((s) => s.test(data))?.mime ?? null

const blobDir = (): string => {
  const dbPath = resolve(useRuntimeConfig().dbPath || DEFAULT_DB_PATH)
  return join(dirname(dbPath), 'files')
}

/**
 * Absolute path of a stored blob.
 *
 * @param {string} key SHA-256 hex digest.
 * @returns {string}
 * @throws {Error} When the key is malformed (prevents path traversal).
 * @example
 *   createReadStream(blobFilePath(node.blobKey))
 */
export const blobFilePath = (key: string): string => {
  if (!BLOB_KEY_PATTERN.test(key)) throw new Error('Invalid blob key')
  return join(blobDir(), key)
}

/**
 * Stores binary data content-addressed under `<db dir>/files/<sha256>`.
 * Identical uploads share one file. Written to a temp name first so a
 * crash never leaves a half-written blob under its final key.
 *
 * @param {Buffer} data
 * @returns {string} The blob key.
 * @example
 *   const key = storeBlob(part.data)
 */
export const storeBlob = (data: Buffer): string => {
  const key = createHash('sha256').update(data).digest('hex')
  const target = blobFilePath(key)
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    writeFileSync(temp, data)
    renameSync(temp, target)
  }
  return key
}

/**
 * Public URL of a binary file node. The `v` query changes whenever the
 * file's bytes change, so the response can be cached as immutable.
 *
 * @param {VfsNode} node A file node with a blob.
 * @returns {string}
 * @example
 *   blobUrl(photo) // → '/files/42/Got%20Light.JPG?v=3f2a9c...'
 */
export const blobUrl = (node: VfsNode): string =>
  `/files/${node.id}/${encodeURIComponent(node.name)}?v=${(node.blobKey || '').slice(0, BLOB_URL_VERSION_LENGTH)}`

/**
 * Whether `version` matches the node's current blob (see `blobUrl`).
 *
 * @param {VfsNode} node
 * @param {unknown} version
 * @returns {boolean}
 * @example
 *   isCurrentBlobVersion(node, getQuery(event).v)
 */
export const isCurrentBlobVersion = (node: VfsNode, version: unknown): boolean =>
  typeof version === 'string' && !!node.blobKey && node.blobKey.slice(0, BLOB_URL_VERSION_LENGTH) === version
