export default defineEventHandler(async (event) => {
  requireAdmin(event)
  assertSameOrigin(event)
  const parts = (await readMultipartFormData(event)) || []
  const field = (name: string) => parts.find((p) => p.name === name && !p.filename)?.data.toString('utf8') || ''
  const file = parts.find((p) => p.name === 'file' && p.filename)

  try {
    if (!file) throw new VfsError('INVALID_PATH', 'Missing file')
    if (file.data.length > BLOB_MAX_BYTES) throw new VfsError('TOO_LARGE', `File exceeds ${BLOB_MAX_BYTES} bytes`)
    const mime = sniffMime(file.data)
    if (!mime) throw new VfsError('UNSUPPORTED_TYPE', `Unsupported file type - ${file.filename}`)
    const destination = field('path')
    if (!destination) throw new VfsError('INVALID_PATH', 'Missing path')
    const overwrite = field('overwrite') === '1'

    return useDb().transaction(() => {
      const { parent, name } = resolveDestination(destination, file.filename as string)
      assertValidName(name)
      const blobKey = storeBlob(file.data)
      const existing = findChild(parent.id, name)
      let node: VfsNode
      if (existing) {
        if (existing.type === 'dir') throw new VfsError('IS_A_DIR', `${name} is a directory`)
        if (!overwrite) throw new VfsError('EXISTS', `${name} already exists`, childPath(parent, name))
        assertWritable(existing)
        node = updateNode(existing.id, { content: '', size: file.data.length, blobKey, mime })
      } else {
        node = createNode(parent.id, { name, type: 'file', content: '', size: file.data.length, blobKey, mime })
      }
      const path = vfsNodePath(node)
      return { path, size: file.data.length, mime, created: !existing, warnings: collectContentWarnings([path]) }
    })()
  } catch (error) {
    return throwVfsHttpError(error)
  }
})
