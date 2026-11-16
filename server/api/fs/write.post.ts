const WRITE_MODES = ['create', 'overwrite', 'append'] as const
type WriteMode = (typeof WRITE_MODES)[number]

export default defineFsWriteHandler(({ body }) => {
  const path = requireBodyString(body, 'path')
  const content = typeof body.content === 'string' ? body.content : ''
  const mode: WriteMode = WRITE_MODES.includes(body.mode as WriteMode) ? (body.mode as WriteMode) : 'overwrite'

  const { parent, name } = resolveParent(path)
  const existing = findChild(parent.id, name)
  let file: VfsNode
  if (!existing) {
    assertContentSize(content)
    file = createNode(parent.id, { name, type: 'file', content })
  } else {
    if (existing.type === 'dir') throw new VfsError('IS_A_DIR', `${name} is a directory`)
    if (mode === 'create') throw new VfsError('EXISTS', `${name} already exists`)
    assertWritable(existing)
    if (mode === 'append' && existing.blobKey) throw new VfsError('UNSUPPORTED_TYPE', `${name} is a binary file`)
    const next = mode === 'append' ? `${existing.content || ''}${content}` : content
    assertContentSize(next)
    file = updateNode(existing.id, { content: next, size: null, blobKey: null, mime: null })
  }

  const canonical = vfsNodePath(file)
  return { path: canonical, size: nodeSize(file), created: !existing, warnings: collectContentWarnings([canonical]) }
})
