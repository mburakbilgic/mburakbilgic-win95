import type { H3Event } from 'h3'

type FsWriteBody = Record<string, unknown>

/**
 * Wraps an admin-only file-system write endpoint: checks the session and
 * Origin, parses the JSON body, runs the handler inside one SQLite
 * transaction, adds `siteChanged` to the response and converts VfsErrors
 * into HTTP errors.
 *
 * @param {(ctx: { event: H3Event, body: FsWriteBody }) => object} handler
 * @returns {ReturnType<typeof defineEventHandler>}
 * @throws {H3Error} 401/403 for auth, 4xx for VFS errors.
 * @example
 *   export default defineFsWriteHandler(({ body }) => ({ path: makeDir(requireBodyString(body, 'path')) }))
 */
export const defineFsWriteHandler = (handler: (ctx: { event: H3Event; body: FsWriteBody }) => object) =>
  defineEventHandler(async (event) => {
    requireAdmin(event)
    assertSameOrigin(event)
    const raw = await readBody(event).catch(() => null)
    const body: FsWriteBody = raw && typeof raw === 'object' ? (raw as FsWriteBody) : {}
    try {
      return useDb().transaction(() => trackSiteChange(() => handler({ event, body })))()
    } catch (error) {
      return throwVfsHttpError(error)
    }
  })

/**
 * Reads a required string field from a write request body.
 *
 * @param {FsWriteBody} body
 * @param {string} key
 * @returns {string}
 * @throws {VfsError} INVALID_PATH when missing or not a string.
 * @example
 *   const path = requireBodyString(body, 'path')
 */
export const requireBodyString = (body: FsWriteBody, key: string): string => {
  const value = body[key]
  if (typeof value !== 'string' || !value) throw new VfsError('INVALID_PATH', `Missing ${key}`)
  return value
}

/**
 * Resolves a path that must already exist (hidden nodes included, since
 * only the admin reaches write endpoints).
 *
 * @param {string} path
 * @returns {VfsNode}
 * @throws {VfsError} NOT_FOUND
 * @example
 *   const node = resolveExisting(requireBodyString(body, 'path'))
 */
export const resolveExisting = (path: string): VfsNode => {
  const node = resolveVfsPath(path, { includeHidden: true })
  if (!node) throw new VfsError('NOT_FOUND', `File not found - ${path}`)
  return node
}

/**
 * Throws when the node is a protected site directory.
 *
 * @param {VfsNode} node
 * @returns {void}
 * @throws {VfsError} PROTECTED
 * @example
 *   assertNotProtected(dir)
 */
export const assertNotProtected = (node: VfsNode): void => {
  if (node.parentId === null || isProtectedPath(vfsNodePath(node))) {
    throw new VfsError('PROTECTED', `Access denied - ${node.name}`)
  }
}

/**
 * Throws when a file carries the read-only attribute.
 *
 * @param {VfsNode} node
 * @returns {void}
 * @throws {VfsError} READ_ONLY
 * @example
 *   assertWritable(file)
 */
export const assertWritable = (node: VfsNode): void => {
  if (node.readonly) throw new VfsError('READ_ONLY', `Access denied - ${node.name}`)
}

/**
 * Resolves the destination of COPY/MOVE the way DOS does: when `to` is an
 * existing directory the source keeps its name inside it, otherwise the
 * last segment of `to` is the new name.
 *
 * @param {string} to
 * @param {string} sourceName
 * @returns {{ parent: VfsNode, name: string }}
 * @throws {VfsError} NOT_FOUND / NOT_A_DIR for a bad destination parent.
 * @example
 *   resolveDestination('C:\\MBURAKBILGIC\\DESKTOP', 'todo.TXT')
 */
export const resolveDestination = (to: string, sourceName: string): { parent: VfsNode; name: string } => {
  const existing = resolveVfsPath(to, { includeHidden: true })
  if (existing?.type === 'dir') return { parent: existing, name: sourceName }
  return resolveParent(to)
}
