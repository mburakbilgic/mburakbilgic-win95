export default defineEventHandler((event) => {
  const session = getSession(event)
  return session ? { admin: true, expiresAt: session.expiresAt } : { admin: false, expiresAt: null }
})
