export default defineFsWriteHandler(({ body }) => {
  const node = resolveExisting(requireBodyString(body, 'path'))
  const newName = requireBodyString(body, 'newName')
  assertNotProtected(node)
  assertValidName(newName)
  const clash = node.parentId === null ? null : findChild(node.parentId, newName)
  if (clash && clash.id !== node.id) throw new VfsError('EXISTS', `${newName} already exists`)
  const oldPath = vfsNodePath(node)
  const renamed = updateNode(node.id, { name: newName })
  const path = vfsNodePath(renamed)
  return { path, warnings: collectContentWarnings([oldPath, path]) }
})
