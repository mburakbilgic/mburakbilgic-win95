export default defineEventHandler((event) => {
  const { node, includeHidden } = resolveQueryPath(event)
  if (node.type !== 'dir') throwVfsHttpError(new VfsError('NOT_A_DIR', `${node.name} is not a directory`))
  return {
    path: vfsNodePath(node),
    updatedAt: node.updatedAt,
    entries: listChildren(node.id, { includeHidden }).map(toFsEntry),
  }
})
