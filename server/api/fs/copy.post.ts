export default defineFsWriteHandler(({ body }) => {
  const source = resolveExisting(requireBodyString(body, 'from'))
  if (source.type === 'dir') throw new VfsError('IS_A_DIR', `${source.name} is a directory`)
  const { parent, name } = resolveDestination(requireBodyString(body, 'to'), source.name)
  const existing = findChild(parent.id, name)

  let file: VfsNode
  if (existing) {
    if (existing.id === source.id) throw new VfsError('INVALID_MOVE', 'File cannot be copied onto itself')
    if (existing.type === 'dir') throw new VfsError('IS_A_DIR', `${name} is a directory`)
    if (body.overwrite !== true) throw new VfsError('EXISTS', `${name} already exists`, childPath(parent, name))
    assertWritable(existing)
    file = updateNode(existing.id, { content: source.content || '', size: source.size, blobKey: source.blobKey, mime: source.mime })
  } else {
    file = createNode(parent.id, {
      name,
      type: 'file',
      content: source.content || '',
      size: source.size,
      blobKey: source.blobKey,
      mime: source.mime,
    })
  }
  const path = vfsNodePath(file)
  return { path, warnings: collectContentWarnings([path]) }
})
