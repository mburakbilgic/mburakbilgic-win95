export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  assertLoginAllowed(ip)

  const stored = useRuntimeConfig().adminPasswordHash
  if (!stored) throwAuthError(503, 'AUTH_NOT_CONFIGURED')

  const body = await readBody(event).catch(() => null)
  const password = body && typeof body === 'object' ? (body as Record<string, unknown>).password : null
  if (typeof password !== 'string' || !(await verifyPassword(password, stored))) {
    recordFailedLogin(ip)
    throwAuthError(401, 'INVALID_PASSWORD')
  }

  clearFailedLogins(ip)
  return { admin: true, expiresAt: createSession(event), newMessages: takeNewMessageCount() }
})
