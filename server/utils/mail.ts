import nodemailer, { type Transporter } from 'nodemailer'

export const MAIL_SUBJECT_MAX_LENGTH = 200
export const MAIL_SENDER_MAX_LENGTH = 254
export const MAIL_CONTENT_MAX_LENGTH = 5000
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
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

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
 * Line breaks are removed from the subject and sender and control
 * characters from every field, so nothing can inject mail headers.
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

  const cleanSubject = (subject as string).replace(LINE_BREAKS, ' ').replace(CONTROL_CHARS, '').trim()
  const cleanSender = (sender as string).replace(LINE_BREAKS, '').replace(CONTROL_CHARS, '').trim()
  const cleanContent = (content as string).replace(CONTROL_CHARS, '').trim()

  if (!cleanSubject || cleanSubject.length > MAIL_SUBJECT_MAX_LENGTH) throwMailError(400, 'INVALID_SUBJECT')
  if (cleanSender.length > MAIL_SENDER_MAX_LENGTH || !EMAIL_PATTERN.test(cleanSender)) {
    throwMailError(400, 'INVALID_SENDER')
  }
  if (!cleanContent || cleanContent.length > MAIL_CONTENT_MAX_LENGTH) throwMailError(400, 'INVALID_CONTENT')

  return { subject: cleanSubject, sender: cleanSender, content: cleanContent }
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MAIL_EVENT_RETENTION_MS = 90 * DAY_MS

const countEvents = (where: string, ...params: Array<string | number>): number =>
  (useDb().prepare(`SELECT count(*) AS n FROM mail_events WHERE ${where}`).get(...params) as { n: number }).n

/**
 * Rate limits backed by the `mail_events` table, so they survive restarts:
 * per-IP burst and daily limits and a per-sender daily limit, all from
 * SPAM.INI. Every accepted request (spam included) counts.
 *
 * @param {string} ip
 * @param {string} sender Lower-cased sender address.
 * @param {SpamSettings} settings
 * @returns {void}
 * @throws {H3Error} 429 RATE_LIMITED
 * @example
 *   assertMailRateLimits(ip, payload.sender.toLowerCase(), rules.settings)
 */
export const assertMailRateLimits = (ip: string, sender: string, settings: SpamSettings): void => {
  const now = Date.now()
  if (
    countEvents('ip = ? AND created_at > ?', ip, now - settings.ipBurstMinutes * MINUTE_MS) >= settings.ipBurstMax ||
    countEvents('ip = ? AND created_at > ?', ip, now - DAY_MS) >= settings.ipDailyMax ||
    (sender && countEvents('sender = ? AND created_at > ?', sender, now - DAY_MS) >= settings.senderDailyMax)
  ) {
    throwMailError(429, 'RATE_LIMITED')
  }
}

/**
 * How many messages with the same normalised body arrived in the last day.
 *
 * @param {string} bodyHash
 * @returns {number}
 */
export const countRecentDuplicates = (bodyHash: string): number =>
  countEvents('body_hash = ? AND created_at > ?', bodyHash, Date.now() - DAY_MS)

/**
 * Whether the hourly notification-mail cap is reached (protects the SMTP
 * account from being rate-limited or flagged during a flood).
 *
 * @param {SpamSettings} settings
 * @returns {boolean}
 */
export const isHourlyMailCapReached = (settings: SpamSettings): boolean =>
  countEvents('mailed = 1 AND created_at > ?', Date.now() - HOUR_MS) >= settings.hourlyMailCap

/**
 * Stores one contact-form request for rate limiting, duplicate detection
 * and `MAIL /S` statistics; events older than 90 days are dropped.
 *
 * @param {{ ip: string, sender: string, bodyHash: string, verdict: string, score: number, reasons: string[], mailed: boolean }} event
 * @returns {void}
 */
export const recordMailEvent = (event: {
  ip: string
  sender: string
  bodyHash: string
  verdict: string
  score: number
  reasons: string[]
  mailed: boolean
}): void => {
  const db = useDb()
  const now = Date.now()
  db.prepare(
    'INSERT INTO mail_events (created_at, ip, sender, body_hash, verdict, score, reasons, mailed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(now, event.ip, event.sender, event.bodyHash, event.verdict, event.score, JSON.stringify(event.reasons), event.mailed ? 1 : 0)
  db.prepare('DELETE FROM mail_events WHERE created_at < ?').run(now - MAIL_EVENT_RETENTION_MS)
}

const STATS_REASON_ARGUMENT = /\(\d+(?:ms)?\)$/

/**
 * Summary for `MAIL /S`: verdict counts and the most frequent rule hits
 * over the last `days` days. Numeric details such as `(1200ms)` are
 * dropped so the same rule groups together.
 *
 * @param {number} days
 * @param {number} top How many reasons to return.
 * @returns {{ days: number, total: number, mailed: number, verdicts: Record<string, number>, reasons: Array<{ reason: string, count: number }> }}
 */
export const mailStats = (days: number, top: number) => {
  const rows = useDb()
    .prepare('SELECT verdict, reasons, mailed FROM mail_events WHERE created_at > ?')
    .all(Date.now() - days * DAY_MS) as Array<{ verdict: string; reasons: string; mailed: number }>
  const verdicts: Record<string, number> = { pass: 0, review: 0, reject: 0 }
  const reasonCounts = new Map<string, number>()
  rows.forEach((row) => {
    verdicts[row.verdict] = (verdicts[row.verdict] || 0) + 1
    for (const reason of JSON.parse(row.reasons) as string[]) {
      const key = reason.replace(STATS_REASON_ARGUMENT, '')
      reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1)
    }
  })
  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([reason, count]) => ({ reason, count }))
  return { days, total: rows.length, mailed: rows.filter((r) => r.mailed).length, verdicts, reasons }
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
