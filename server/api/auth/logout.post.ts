export default defineEventHandler((event) => {
  assertSameOrigin(event)
  destroySession(event)
  return { admin: false }
})
