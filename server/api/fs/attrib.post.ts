export default defineFsWriteHandler(({ body }) => {
  const node = resolveExisting(requireBodyString(body, 'path'))
  const hidden = typeof body.hidden === 'boolean' ? body.hidden : undefined
  const readonly = typeof body.readonly === 'boolean' ? body.readonly : undefined
  if (hidden === true) assertNotProtected(node)
  // Messages contain visitors' addresses and IPs: the mailbox must stay hidden from visitors.
  if (hidden === false && vfsNodePath(node).toUpperCase() === MAIL_ROOT_PATH.toUpperCase()) {
    throw new VfsError('PROTECTED', 'Access denied')
  }
  if (node.parentId === null) throw new VfsError('PROTECTED', 'Access denied')
  const updated = updateNode(node.id, { hidden, readonly })
  const path = vfsNodePath(updated)
  return { path, hidden: updated.hidden, readonly: updated.readonly, warnings: collectContentWarnings([path]) }
})
