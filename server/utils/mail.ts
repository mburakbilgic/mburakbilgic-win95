import nodemailer, { type Transporter } from 'nodemailer'

export const MAIL_SUBJECT_MAX_LENGTH = 200
export const MAIL_SENDER_MAX_LENGTH = 254
export const MAIL_CONTENT_MAX_LENGTH = 5000
export const MAIL_RATE_LIMIT_MAX_REQUESTS = 5
export const MAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
export const MAIL_SUBJECT_PREFIX = '[mburakbilgic.com]'

export type MailErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_SUBJECT'
  | 'INVALID_SENDER'
  | 'INVALID_CONTENT'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'SEND_FAILED'

export interface MailPayload {
  subject: string
  sender: string
  content: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINE_BREAKS = /[\r\n]+/g

/**
 * Throws an H3 error whose `data.code` the mail window maps to a
 * user-facing message from `content/mail.json`.
 *
 * @param {number} statusCode HTTP status to return.
 * @param {MailErrorCode} code Machine-readable reason.
 * @returns {never}
 * @throws {H3Error} Always.
 * @example
 *   throwMailError(400, 'INVALID_SENDER')
 */
export const throwMailError = (statusCode: number, code: MailErrorCode): never => {
  throw createError({ statusCode, statusMessage: code, data: { code } })
}

/**
 * Validates and normalises the raw request body of `POST /api/mail`.
 * Subject line breaks are collapsed so they can never inject headers.
 *
 * @param {unknown} body Parsed JSON body.
 * @returns {MailPayload} Trimmed, validated payload.
 * @throws {H3Error} 400 with the first failing field's code.
 * @example
 *   const payload = parseMailPayload(await readBody(event))
 */
export const parseMailPayload = (body: unknown): MailPayload => {
  if (!body || typeof body !== 'object') throwMailError(400, 'INVALID_PAYLOAD')
  const { subject, sender, content } = body as Record<string, unknown>

  if (typeof subject !== 'string' || typeof sender !== 'string' || typeof content !== 'string') {
    throwMailError(400, 'INVALID_PAYLOAD')
  }

  const cleanSubject = (subject as string).replace(LINE_BREAKS, ' ').trim()
  const cleanSender = (sender as string).trim()
  const cleanContent = (content as string).trim()

  if (!cleanSubject || cleanSubject.length > MAIL_SUBJECT_MAX_LENGTH) throwMailError(400, 'INVALID_SUBJECT')
  if (cleanSender.length > MAIL_SENDER_MAX_LENGTH || !EMAIL_PATTERN.test(cleanSender)) {
    throwMailError(400, 'INVALID_SENDER')
  }
  if (!cleanContent || cleanContent.length > MAIL_CONTENT_MAX_LENGTH) throwMailError(400, 'INVALID_CONTENT')

  return { subject: cleanSubject, sender: cleanSender, content: cleanContent }
}

const requestLog = new Map<string, number[]>()

/**
 * Sliding-window, in-memory rate limiter keyed by client IP. State lives in
 * the single PM2 process, so it resets on restart — acceptable for a
 * contact form; move to the database if the app is ever clustered.
 *
 * @param {string} ip Client IP address.
 * @returns {void}
 * @throws {H3Error} 429 when the IP exceeded the allowed request count.
 * @example
 *   assertWithinRateLimit(getRequestIP(event, { xForwardedFor: true }) || 'unknown')
 */
export const assertWithinRateLimit = (ip: string): void => {
  const now = Date.now()
  const recent = (requestLog.get(ip) || []).filter((t) => now - t < MAIL_RATE_LIMIT_WINDOW_MS)
  if (recent.length >= MAIL_RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, recent)
    throwMailError(429, 'RATE_LIMITED')
  }
  recent.push(now)
  requestLog.set(ip, recent)
}

let transporter: Transporter | null = null

/**
 * Lazily builds a single SMTP transporter from runtime config.
 *
 * @returns {{ transporter: Transporter, from: string, to: string }}
 * @throws {H3Error} 503 when SMTP credentials are not configured.
 * @example
 *   const { transporter, from, to } = getMailTransport()
 */
export const getMailTransport = () => {
  const config = useRuntimeConfig()
  const host = config.mailSmtpHost
  const user = config.mailSmtpUser
  // Google shows App Passwords in 4-char groups ("abcd efgh ..."); people paste them as-is.
  const pass = String(config.mailSmtpPass || '').replace(/\s/g, '')
  if (!host || !user || !pass) throwMailError(503, 'NOT_CONFIGURED')

  const port = Number(config.mailSmtpPort) || 465
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  }
  return { transporter, from: user, to: config.mailTo || user }
}
