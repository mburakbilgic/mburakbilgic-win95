import { createReadStream, existsSync } from 'node:fs'

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE = 'public, max-age=0, must-revalidate'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const node = Number.isInteger(id) ? getNodeById(id) : null
  const visible = node && node.type === 'file' && node.blobKey && (!node.hidden || isAdmin(event))
  if (!node || !visible) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND' })

  const path = blobFilePath(node.blobKey as string)
  if (!existsSync(path)) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND' })

  const etag = `"${node.blobKey}"`
  setResponseHeaders(event, {
    'Content-Type': node.mime || 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(node.name)}`,
    'Cache-Control': isCurrentBlobVersion(node, getQuery(event).v) ? IMMUTABLE_CACHE : REVALIDATE_CACHE,
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
  })
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  setResponseHeader(event, 'Content-Length', String(node.size ?? 0))
  return sendStream(event, createReadStream(path))
})
