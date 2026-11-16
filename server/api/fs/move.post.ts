export default defineFsWriteHandler(({ body }) => {
  const node = resolveExisting(requireBodyString(body, 'from'))
  assertNotProtected(node)
  const { parent, name } = resolveDestination(requireBodyString(body, 'to'), node.name)
  if (node.type === 'dir' && isSameOrAncestor(node.id, parent.id)) {
    throw new VfsError('INVALID_MOVE', `Cannot move ${node.name} into itself`)
  }
  assertValidName(name)
  const clash = findChild(parent.id, name)
  if (clash && clash.id !== node.id) throw new VfsError('EXISTS', `${name} already exists`)
  const oldPath = vfsNodePath(node)
  const moved = updateNode(node.id, { parentId: parent.id, name })
  const path = vfsNodePath(moved)
  return { from: oldPath, path, warnings: collectContentWarnings([oldPath, path]) }
})
