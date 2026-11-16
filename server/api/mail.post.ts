export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)

  // Honeypot: bots fill every field; real users never see `website`.
  // Answer as if it succeeded so the bot gets no signal.
  if (body && typeof body === 'object' && (body as Record<string, unknown>).website) {
    return { ok: true }
  }

  const payload = parseMailPayload(body)
  assertWithinRateLimit(getRequestIP(event, { xForwardedFor: true }) || 'unknown')

  const { transporter, from, to } = getMailTransport()

  try {
    await transporter.sendMail({
      from: { name: 'mburakbilgic.com', address: from },
      to,
      replyTo: payload.sender,
      subject: `${MAIL_SUBJECT_PREFIX} ${payload.subject}`,
      text: `From: ${payload.sender}\n\n${payload.content}`,
    })
  } catch (error) {
    console.error('[mail] SMTP send failed:', error instanceof Error ? error.message : error)
    throwMailError(502, 'SEND_FAILED')
  }

  return { ok: true }
})
