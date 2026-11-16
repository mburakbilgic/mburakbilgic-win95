export default defineFsWriteHandler(({ body }) => {
  const { parent, name } = resolveParent(requireBodyString(body, 'path'))
  const dir = createNode(parent.id, { name, type: 'dir' })
  return { path: vfsNodePath(dir) }
})
