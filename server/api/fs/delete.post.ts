export default defineFsWriteHandler(({ body }) => {
  const node = resolveExisting(requireBodyString(body, 'path'))
  const recursive = body.recursive === true
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
