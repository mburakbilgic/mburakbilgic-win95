export type VfsNodeType = 'dir' | 'file'

export interface VfsNode {
  id: number
  parentId: number | null
  name: string
  type: VfsNodeType
  content: string | null
  size: number | null
  hidden: boolean
  readonly: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type VfsErrorCode = 'INVALID_PATH' | 'INVALID_NAME' | 'NOT_FOUND' | 'NOT_A_DIR' | 'EXISTS'

export class VfsError extends Error {
  constructor(public code: VfsErrorCode, message: string) {
    super(message)
    this.name = 'VfsError'
  }
}

export const VFS_DRIVE = 'C:'
export const VFS_NAME_MAX_LENGTH = 255
const INVALID_NAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/

interface NodeRow {
  id: number
  parent_id: number | null
  name: string
  type: VfsNodeType
  content: string | null
  size: number | null
  hidden: number
  readonly: number
  sort_order: number
  created_at: string
  updated_at: string
}

const toNode = (row: NodeRow): VfsNode => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  type: row.type,
  content: row.content,
  size: row.size,
  hidden: row.hidden === 1,
  readonly: row.readonly === 1,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * Splits an absolute DOS path into its segments below the drive. Accepts
 * both `\` and `/`, surrounding quotes and repeated separators, and is
 * case-insensitive on the drive letter.
 *
 * @param {string} path Absolute path such as `C:\MBURAKBILGIC\DESKTOP`.
 * @returns {string[]} Segments below `C:` (empty for the drive root).
 * @throws {VfsError} INVALID_PATH when the path is not absolute on drive C.
 * @example
 *   splitVfsPath('c:/mburakbilgic/Desktop/') // → ['mburakbilgic', 'Desktop']
 */
export const splitVfsPath = (path: string): string[] => {
  const parts = path.trim().replace(/^"|"$/g, '').split(/[\\/]+/).filter(Boolean)
  if (!parts.length || parts[0].toUpperCase() !== VFS_DRIVE) {
    throw new VfsError('INVALID_PATH', `Invalid path - ${path}`)
  }
  return parts.slice(1)
}

/**
 * Throws when a file or directory name is not valid on Win95 (reserved
 * characters, empty, or too long).
 *
 * @param {string} name
 * @returns {void}
 * @throws {VfsError} INVALID_NAME
 * @example
 *   assertValidName('Notlar') // ok
 */
export const assertValidName = (name: string): void => {
  if (!name || name === '.' || name === '..' || name.length > VFS_NAME_MAX_LENGTH || INVALID_NAME_CHARS.test(name)) {
    throw new VfsError('INVALID_NAME', `Invalid file name - ${name}`)
  }
}

/**
 * Returns the drive root node (`C:`).
 *
 * @returns {VfsNode}
 * @example
 *   const root = getRootNode()
 */
export const getRootNode = (): VfsNode =>
  toNode(useDb().prepare('SELECT * FROM nodes WHERE parent_id IS NULL').get() as NodeRow)

/**
 * Finds a direct child of a directory by name (case-insensitive).
 *
 * @param {number} parentId
 * @param {string} name
 * @returns {VfsNode | null}
 * @example
 *   const desktop = findChild(home.id, 'desktop')
 */
export const findChild = (parentId: number, name: string): VfsNode | null => {
  const row = useDb()
    .prepare('SELECT * FROM nodes WHERE parent_id = ? AND name = ? COLLATE NOCASE')
    .get(parentId, name) as NodeRow | undefined
  return row ? toNode(row) : null
}

/**
 * Resolves an absolute path to its node. Hidden nodes (and anything below
 * them) are treated as missing unless `includeHidden` is set, so visitors
 * cannot reach `ATTRIB +H` content by guessing its path.
 *
 * @param {string} path
 * @param {{ includeHidden?: boolean }} [options]
 * @returns {VfsNode | null} `null` when any segment does not exist or is hidden.
 * @throws {VfsError} INVALID_PATH for malformed paths.
 * @example
 *   resolveVfsPath('C:\MBURAKBILGIC\SITE.INI', { includeHidden: isAdmin(event) })
 */
export const resolveVfsPath = (path: string, options: { includeHidden?: boolean } = {}): VfsNode | null => {
  let node: VfsNode | null = getRootNode()
  for (const segment of splitVfsPath(path)) {
    if (!node || node.type !== 'dir') return null
    node = findChild(node.id, segment)
    if (node && node.hidden && !options.includeHidden) return null
  }
  return node
}

/**
 * Builds the canonical absolute path of a node using the stored names
 * (so `c:/mburakbilgic/desktop` comes back as `C:\MBURAKBILGIC\DESKTOP`).
 *
 * @param {VfsNode} node
 * @returns {string}
 * @example
 *   vfsNodePath(desktop) // → 'C:\MBURAKBILGIC\DESKTOP'
 */
export const vfsNodePath = (node: VfsNode): string => {
  const names: string[] = []
  let current: NodeRow | undefined = { id: node.id, parent_id: node.parentId, name: node.name } as NodeRow
  const parentStatement = useDb().prepare('SELECT * FROM nodes WHERE id = ?')
  while (current && current.parent_id !== null) {
    names.unshift(current.name)
    current = parentStatement.get(current.parent_id) as NodeRow | undefined
  }
  return `${VFS_DRIVE}\\${names.join('\\')}`
}

/**
 * Converts a VfsError into the HTTP error the DOS shell understands;
 * anything else is re-thrown untouched.
 *
 * @param {unknown} error
 * @returns {never}
 * @throws {H3Error} 400 for bad paths/names, 404 for missing nodes, 409 for conflicts.
 * @example
 *   try { ... } catch (e) { throwVfsHttpError(e) }
 */
export const throwVfsHttpError = (error: unknown): never => {
  if (!(error instanceof VfsError)) throw error
  const statusCode = { INVALID_PATH: 400, INVALID_NAME: 400, NOT_A_DIR: 400, NOT_FOUND: 404, EXISTS: 409 }[error.code]
  throw createError({ statusCode, statusMessage: error.code, data: { code: error.code } })
}

/**
 * Lists a directory's children ordered by `sort_order`, then name.
 *
 * @param {number} parentId
 * @param {{ includeHidden?: boolean }} [options]
 * @returns {VfsNode[]}
 * @example
 *   listChildren(dir.id, { includeHidden: true })
 */
export const listChildren = (parentId: number, options: { includeHidden?: boolean } = {}): VfsNode[] => {
  const rows = useDb()
    .prepare(
      `SELECT * FROM nodes WHERE parent_id = ? ${options.includeHidden ? '' : 'AND hidden = 0'}
       ORDER BY sort_order, name COLLATE NOCASE`,
    )
    .all(parentId) as NodeRow[]
  return rows.map(toNode)
}

/**
 * Creates a node under a directory.
 *
 * @param {number} parentId
 * @param {{ name: string, type: VfsNodeType, content?: string|null, size?: number|null, hidden?: boolean, readonly?: boolean, sortOrder?: number }} input
 * @returns {VfsNode}
 * @throws {VfsError} INVALID_NAME, NOT_A_DIR or EXISTS.
 * @example
 *   createNode(desktop.id, { name: 'Notlar', type: 'dir' })
 */
export const createNode = (
  parentId: number,
  input: {
    name: string
    type: VfsNodeType
    content?: string | null
    size?: number | null
    hidden?: boolean
    readonly?: boolean
    sortOrder?: number
  },
): VfsNode => {
  assertValidName(input.name)
  const parent = useDb().prepare('SELECT * FROM nodes WHERE id = ?').get(parentId) as NodeRow | undefined
  if (!parent) throw new VfsError('NOT_FOUND', 'Path not found')
  if (parent.type !== 'dir') throw new VfsError('NOT_A_DIR', `${parent.name} is not a directory`)
  if (findChild(parentId, input.name)) throw new VfsError('EXISTS', `${input.name} already exists`)

  const result = useDb()
    .prepare(
      `INSERT INTO nodes (parent_id, name, type, content, size, hidden, readonly, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parentId,
      input.name,
      input.type,
      input.type === 'file' ? (input.content ?? '') : null,
      input.size ?? null,
      input.hidden ? 1 : 0,
      input.readonly ? 1 : 0,
      input.sortOrder ?? 0,
    )
  return toNode(useDb().prepare('SELECT * FROM nodes WHERE id = ?').get(result.lastInsertRowid) as NodeRow)
}

/**
 * Size shown for a node: the stored size (e.g. a remote photo's byte
 * count) or the UTF-8 length of its text content.
 *
 * @param {VfsNode} node
 * @returns {number}
 * @example
 *   nodeSize(file) // → 128
 */
export const nodeSize = (node: VfsNode): number =>
  node.size ?? (node.content ? Buffer.byteLength(node.content, 'utf8') : 0)

/**
 * Returns the upper-cased extension of a file name without the dot.
 *
 * @param {string} name
 * @returns {string} e.g. `LNK`, or `''` when there is none.
 * @example
 *   fileExtension('Biography.lnk') // → 'LNK'
 */
export const fileExtension = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : ''
}

/**
 * Returns a file name without its extension.
 *
 * @param {string} name
 * @returns {string}
 * @example
 *   baseName('Got Light.JPG') // → 'Got Light'
 */
export const baseName = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
