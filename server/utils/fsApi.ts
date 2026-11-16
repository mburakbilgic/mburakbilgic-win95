import type { H3Event } from 'h3'

export const FS_TREE_MAX_DEPTH = 16

export interface FsEntry {
  name: string
  type: VfsNodeType
  size: number
  updatedAt: string
  hidden: boolean
  readonly: boolean
}

export interface FsTreeNode {
  name: string
  type: VfsNodeType
  children?: FsTreeNode[]
}

/**
 * Resolves the `path` query parameter for the read-only FS endpoints,
 * applying hidden-file visibility for the current visitor.
 *
 * @param {H3Event} event
 * @returns {{ node: VfsNode, includeHidden: boolean }}
 * @throws {H3Error} 400 INVALID_PATH, 404 NOT_FOUND
 * @example
 *   const { node, includeHidden } = resolveQueryPath(event)
 */
export const resolveQueryPath = (event: H3Event): { node: VfsNode; includeHidden: boolean } => {
  const { path } = getQuery(event)
  const includeHidden = isAdmin(event)
  try {
    if (typeof path !== 'string' || !path) throw new VfsError('INVALID_PATH', 'Missing path')
    const node = resolveVfsPath(path, { includeHidden })
    if (!node) throw new VfsError('NOT_FOUND', `Not found - ${path}`)
    return { node, includeHidden }
  } catch (error) {
    return throwVfsHttpError(error)
  }
}

/**
 * Maps a node to the listing shape returned by `GET /api/fs/list`.
 *
 * @param {VfsNode} node
 * @returns {FsEntry}
 * @example
 *   listChildren(dir.id).map(toFsEntry)
 */
export const toFsEntry = (node: VfsNode): FsEntry => ({
  name: node.name,
  type: node.type,
  size: node.type === 'file' ? nodeSize(node) : 0,
  updatedAt: node.updatedAt,
  hidden: node.hidden,
  readonly: node.readonly,
})

/**
 * Builds a recursive directory tree for the TREE command.
 *
 * @param {VfsNode} dir
 * @param {{ includeFiles: boolean, includeHidden: boolean }} options
 * @param {number} [depth]
 * @returns {FsTreeNode[]}
 * @example
 *   buildFsTree(home, { includeFiles: true, includeHidden: false })
 */
export const buildFsTree = (
  dir: VfsNode,
  options: { includeFiles: boolean; includeHidden: boolean },
  depth = 0,
): FsTreeNode[] => {
  if (depth >= FS_TREE_MAX_DEPTH) return []
  return listChildren(dir.id, { includeHidden: options.includeHidden })
    .filter((n) => n.type === 'dir' || options.includeFiles)
    .map((n) =>
      n.type === 'dir'
        ? { name: n.name, type: n.type, children: buildFsTree(n, options, depth + 1) }
        : { name: n.name, type: n.type },
    )
}
