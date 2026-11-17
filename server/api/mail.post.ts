import { createHash } from 'node:crypto'

const originCheck = (event: Parameters<typeof getRequestHeader>[0]): 'ok' | 'missing' | 'mismatch' => {
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return 'missing'
  const expected = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return origin === expected ? 'ok' : 'mismatch'
}

const shouldMail = (verdict: MailVerdict, mode: SpamMode): boolean => verdict !== 'reject' || mode !== 'enforce'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const userAgent = getRequestHeader(event, 'user-agent') || ''
  const rules = loadSpamRules()

  let payload: MailPayload
  try {
    payload = parseMailPayload(body)
  } catch (error) {
    if (fields.website) return { ok: true }
    throw error
  }
  const sender = payload.sender.toLowerCase()
  assertMailRateLimits(ip, sender, rules.settings)

  const bodyHash = createHash('sha256').update(normalizeForMatch(payload.content)).digest('hex')
  let result: SpamResult
  if (fields.website) {
    // Honeypot: only bots fill the hidden field. Stored as spam, answered as success.
    result = { score: SPAM_MAX_SCORE, verdict: 'reject', reasons: ['honeypot'] }
  } else if (rules.settings.mode === 'off') {
    result = { score: 0, verdict: 'pass', reasons: [] }
  } else {
    result = evaluateSpam(
      {
        ...payload,
        ip,
        origin: originCheck(event),
        token: verifyFormToken(fields.token, rules.settings),
        duplicates: countRecentDuplicates(bodyHash),
        mx: await checkMailDomain(sender.split('@')[1] || ''),
      },
      rules,
    )
  }

  const wantsMail = shouldMail(result.verdict, rules.settings.mode) && !fields.website
  const capped = wantsMail && isHourlyMailCapReached(rules.settings)
  let mailed = false
  let mailNote = wantsMail ? (capped ? 'no (hourly cap)' : 'yes') : 'no (spam)'

  if (wantsMail && !capped) {
    try {
      const { transporter, from, to } = getMailTransport()
      const tag = result.verdict === 'pass' ? '' : ` [SPAM? ${result.score}]`
      await transporter.sendMail({
        from: { name: 'mburakbilgic.com', address: from },
        to,
        replyTo: payload.sender,
        subject: `${MAIL_SUBJECT_PREFIX}${tag} ${payload.subject}`,
        text: `From: ${payload.sender}\n\n${payload.content}`,
        headers: {
          'X-Contact-Source': 'mburakbilgic.com',
          'X-Spam-Score': String(result.score),
          'X-Spam-Verdict': result.verdict,
          'X-Spam-Reasons': result.reasons.join(', ').slice(0, 900) || '-',
        },
      })
      mailed = true
    } catch (error) {
      // The message is stored in C:\MAIL either way, so the visitor still gets a success answer.
      console.error('[mail] SMTP send failed:', error instanceof Error ? error.message : error)
      mailNote = 'no (send failed)'
    }
  }

  useDb().transaction(() => {
    saveMessage({
      ...payload,
      ip,
      userAgent,
      receivedAt: new Date(),
      score: result.score,
      verdict: result.verdict,
      reasons: result.reasons,
      mailed: mailNote,
    })
    recordMailEvent({ ip, sender, bodyHash, verdict: result.verdict, score: result.score, reasons: result.reasons, mailed })
    purgeMailbox({ spamRetentionDays: rules.settings.spamRetentionDays, maxPerFolder: rules.settings.maxMessagesPerFolder })
  })()

  return { ok: true }
})
