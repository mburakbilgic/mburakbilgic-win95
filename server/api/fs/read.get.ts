export default defineEventHandler((event) => {
  const { node } = resolveQueryPath(event)
  if (node.type !== 'file') throw createError({ statusCode: 400, statusMessage: 'IS_A_DIR', data: { code: 'IS_A_DIR' } })
  return { path: vfsNodePath(node), ...toFsEntry(node), content: node.content || '' }
})
