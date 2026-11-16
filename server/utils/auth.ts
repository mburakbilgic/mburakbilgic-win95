import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE_NAME = 'mb_session'
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000
export const LOGIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000
const SESSION_TOKEN_BYTES = 32

export type AuthErrorCode =
  | 'AUTH_NOT_CONFIGURED'
  | 'INVALID_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ORIGIN'

/**
 * Throws an H3 error whose `data.code` the DOS shell maps to a message.
 *
 * @param {number} statusCode
 * @param {AuthErrorCode} code
 * @returns {never}
 * @throws {H3Error} Always.
 * @example
 *   throwAuthError(401, 'UNAUTHORIZED')
 */
export const throwAuthError = (statusCode: number, code: AuthErrorCode): never => {
  throw createError({ statusCode, statusMessage: code, data: { code } })
}

const scrypt = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key))),
  )

/**
 * Checks a password against a hash produced by `npm run admin:hash`
 * (`scrypt$N$r$p$saltBase64$hashBase64`). Comparison is constant-time.
 *
 * @param {string} password Plain password typed at the LOGIN prompt.
 * @param {string} stored Hash from NUXT_ADMIN_PASSWORD_HASH.
 * @returns {Promise<boolean>}
 * @example
 *   await verifyPassword('secret', config.adminPasswordHash)
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const failedLogins = new Map<string, number[]>()

/**
 * Throws when the IP has too many failed LOGIN attempts in the lockout
 * window. In-memory and per-process, like the mail limiter.
 *
 * @param {string} ip
 * @returns {void}
 * @throws {H3Error} 429 TOO_MANY_ATTEMPTS
 * @example
 *   assertLoginAllowed(ip)
 */
export const assertLoginAllowed = (ip: string): void => {
  const now = Date.now()
  const recent = (failedLogins.get(ip) || []).filter((t) => now - t < LOGIN_LOCKOUT_WINDOW_MS)
  failedLogins.set(ip, recent)
  if (recent.length >= LOGIN_MAX_FAILED_ATTEMPTS) throwAuthError(429, 'TOO_MANY_ATTEMPTS')
}

/**
 * Records a failed LOGIN attempt for the IP.
 *
 * @param {string} ip
 * @returns {void}
 * @example
 *   recordFailedLogin(ip)
 */
export const recordFailedLogin = (ip: string): void => {
  failedLogins.set(ip, [...(failedLogins.get(ip) || []), Date.now()])
}

/**
 * Clears the failed-attempt counter after a successful LOGIN.
 *
 * @param {string} ip
 * @returns {void}
 * @example
 *   clearFailedLogins(ip)
 */
export const clearFailedLogins = (ip: string): void => {
  failedLogins.delete(ip)
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/**
 * Starts an admin session: stores only the SHA-256 of a random token in
 * SQLite and sends the token in an httpOnly, SameSite=Strict cookie.
 * Sessions expire SESSION_TTL_MS after login (not sliding).
 *
 * @param {H3Event} event
 * @returns {number} Expiry as epoch milliseconds.
 * @example
 *   const expiresAt = createSession(event)
 */
export const createSession = (event: H3Event): number => {
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
  const db = useDb()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, ip) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), now, expiresAt, getRequestIP(event, { xForwardedFor: true }) || null)
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return expiresAt
}

/**
 * Returns the current admin session, or `null` when there is none or it
 * has expired (expired rows are deleted on the way).
 *
 * @param {H3Event} event
 * @returns {{ expiresAt: number } | null}
 * @example
 *   const session = getAdminSession(event)
 */
export const getAdminSession = (event: H3Event): { expiresAt: number } | null => {
  const token = getCookie(event, SESSION_COOKIE_NAME)
  if (!token) return null
  const db = useDb()
  const tokenHash = hashToken(token)
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as
    | { expires_at: number }
    | undefined
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }
  return { expiresAt: row.expires_at }
}

/**
 * Ends the current session in the database and clears the cookie.
 *
 * @param {H3Event} event
 * @returns {void}
 * @example
 *   destroySession(event)
 */
export const destroySession = (event: H3Event): void => {
  const token = getCookie(event, SESSION_COOKIE_NAME)
  if (token) useDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' })
}

/**
 * Whether the request carries a valid admin session.
 *
 * @param {H3Event} event
 * @returns {boolean}
 * @example
 *   const includeHidden = isAdmin(event)
 */
export const isAdmin = (event: H3Event): boolean => getAdminSession(event) !== null

/**
 * Guards admin-only endpoints.
 *
 * @param {H3Event} event
 * @returns {{ expiresAt: number }}
 * @throws {H3Error} 401 UNAUTHORIZED
 * @example
 *   requireAdmin(event)
 */
export const requireAdmin = (event: H3Event): { expiresAt: number } => {
  const session = getAdminSession(event)
  if (!session) throwAuthError(401, 'UNAUTHORIZED')
  return session as { expiresAt: number }
}

/**
 * Rejects state-changing requests whose Origin is not this site, as a
 * second CSRF layer on top of the SameSite=Strict cookie.
 *
 * @param {H3Event} event
 * @returns {void}
 * @throws {H3Error} 403 FORBIDDEN_ORIGIN
 * @example
 *   assertSameOrigin(event)
 */
export const assertSameOrigin = (event: H3Event): void => {
  const origin = getRequestHeader(event, 'origin')
  const expected = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  if (!origin || origin !== expected) throwAuthError(403, 'FORBIDDEN_ORIGIN')
}
