export default defineFsWriteHandler(({ body }) => {
  const node = resolveExisting(requireBodyString(body, 'path'))
  const recursive = body.recursive === true
  if (body.type === 'dir' && node.type !== 'dir') throw new VfsError('NOT_A_DIR', `${node.name} is not a directory`)
  if (body.type === 'file' && node.type !== 'file') throw new VfsError('IS_A_DIR', `${node.name} is a directory`)
  if (node.type === 'dir') {
    assertNotProtected(node)
    if (!recursive && listChildren(node.id, { includeHidden: true }).length) {
      throw new VfsError('NOT_EMPTY', `${node.name} is not empty`)
    }
  } else {
    assertWritable(node)
  }
  const path = vfsNodePath(node)
  deleteNode(node.id)
  return { path, warnings: collectContentWarnings([path]) }
})
