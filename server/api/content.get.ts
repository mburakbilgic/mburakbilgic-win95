export default defineEventHandler(() => {
  try {
    return buildSiteContent()
  } catch (error) {
    console.error('[content] build failed:', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 500, statusMessage: 'CONTENT_UNAVAILABLE' })
  }
})
