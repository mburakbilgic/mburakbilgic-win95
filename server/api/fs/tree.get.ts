export default defineEventHandler((event) => {
  const { node, includeHidden } = resolveQueryPath(event)
  if (node.type !== 'dir') throwVfsHttpError(new VfsError('NOT_A_DIR', `${node.name} is not a directory`))
  const includeFiles = getQuery(event).files === '1'
  return { path: vfsNodePath(node), children: buildFsTree(node, { includeFiles, includeHidden }) }
})
