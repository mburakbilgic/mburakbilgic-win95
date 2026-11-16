export default defineEventHandler((event) => {
  const session = getAdminSession(event)
  return session ? { admin: true, expiresAt: session.expiresAt } : { admin: false, expiresAt: null }
})
