import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as dns } from 'node:dns'

/*
 * Score-based spam filter for the contact form (same model as Tech
 * Monolith: every rule adds 0–100, the total is capped at 100; the
 * verdict thresholds and all word/pattern lists live in C:\MAIL\SPAM.INI).
 * Admin-editable patterns are `*` wildcards, never regular expressions:
 * they run against attacker-controlled text, and wildcard matching is
 * linear, so a careless pattern cannot freeze the server (ReDoS).
 */

export const SPAM_MAX_SCORE = 100
const DEFAULT_ENTRY_SCORE = 40
const MAX_PATTERN_LENGTH = 200
const MAX_ENTRIES_PER_SECTION = 500
const MX_TIMEOUT_MS = 2000
const MX_CACHE_TTL_MS = 60 * 60 * 1000
const FORM_TOKEN_SIGNATURE_CHARS = 32
const FORM_SECRET_MIN_LENGTH = 16

export type SpamMode = 'enforce' | 'tag-only' | 'off'

export interface SpamSettings {
  mode: SpamMode
  reviewScore: number
  rejectScore: number
  minFillSeconds: number
  maxFillMinutes: number
  maxLinks: number
  spamRetentionDays: number
  maxMessagesPerFolder: number
  ipBurstMax: number
  ipBurstMinutes: number
  ipDailyMax: number
  senderDailyMax: number
  hourlyMailCap: number
}

interface WeightedEntry {
  pattern: string
  score: number
  label: string
}

export interface SpamRules {
  settings: SpamSettings
  keywords: WeightedEntry[]
  subjectPatterns: WeightedEntry[]
  bodyPatterns: WeightedEntry[]
  senderPatterns: WeightedEntry[]
  disposableDomains: string[]
  blockedSenders: string[]
  blockedIps: string[]
  allowedSenders: string[]
}

const DEFAULT_SETTINGS: SpamSettings = {
  mode: 'enforce',
  reviewScore: 50,
  rejectScore: 100,
  minFillSeconds: 3,
  maxFillMinutes: 120,
  maxLinks: 1,
  spamRetentionDays: 30,
  maxMessagesPerFolder: 1000,
  ipBurstMax: 5,
  ipBurstMinutes: 10,
  ipDailyMax: 20,
  senderDailyMax: 5,
  hourlyMailCap: 30,
}

const SETTING_BOUNDS: Record<Exclude<keyof SpamSettings, 'mode'>, [number, number]> = {
  reviewScore: [1, 100],
  rejectScore: [1, 100],
  minFillSeconds: [0, 600],
  maxFillMinutes: [1, 7 * 24 * 60],
  maxLinks: [0, 50],
  spamRetentionDays: [1, 3650],
  maxMessagesPerFolder: [10, 100000],
  ipBurstMax: [1, 1000],
  ipBurstMinutes: [1, 1440],
  ipDailyMax: [1, 10000],
  senderDailyMax: [1, 10000],
  hourlyMailCap: [1, 10000],
}

/** Default rules file written to C:\MAIL\SPAM.INI when it is missing. */
export const DEFAULT_SPAM_INI = `; Contact form spam rules. Edit with: EDIT C:\\MAIL\\SPAM.INI
; Each rule adds points (0-100). Total >= ReviewScore -> REVIEW, >= RejectScore -> SPAM.
; Lines starting with ; are comments. Matching ignores case, accents and invisible characters.

[Settings]
; enforce = SPAM is stored but not mailed | tag-only = SPAM is mailed with [SPAM?] | off = no filtering
Mode=enforce
ReviewScore=50
RejectScore=100
; Humans need at least this long to fill the form; bots submit instantly
MinFillSeconds=3
MaxFillMinutes=120
; More links than this in the message add 25 points each
MaxLinks=1
SpamRetentionDays=30
MaxMessagesPerFolder=1000
; Rate limits (requests above these get "Too many messages")
IpBurstMax=5
IpBurstMinutes=10
IpDailyMax=20
SenderDailyMax=5
; At most this many notification mails per hour; the rest is only stored
HourlyMailCap=30

[Keywords]
; Found anywhere (subject, message, sender). word=points (default 40)
viagra
cialis
casino
1xbet
crypto signals
crypto airdrop
forex bonus
seo backlinks
buy followers
bitcoin doubler
wallet recovery
get rich fast
cheap rolex
escort service
binary options profit
guaranteed loan approval
lottery winner
inheritance fund
bahis
deneme bonusu
kumar
kaçak bahis
takipçi satın al
beğeni satın al
seo hizmeti
garantili kazanç
yatırımsız bonus

[SubjectPatterns]
; Wildcards: * = any text. "*http*" = contains http, "re:*" = starts with "re:". pattern=points
*http*=50
*www.*=50
*$$$*=40

[BodyPatterns]
*[url=*=60
*<a href*=60
*whatsapp*+*=30
*telegram: @*=30

[SenderPatterns]
; Matched against the sender address
*@*.ru=40
*@*.cn=40
*noreply*=30

[DisposableDomains]
mailinator.com
guerrillamail.com
guerrillamail.net
sharklasers.com
trashmail.com
yopmail.com
10minutemail.com
temp-mail.org
tempmail.com
fakeinbox.com
maildrop.cc
getnada.com
dispostable.com
throwawaymail.com
discard.email
mailpoof.com

[BlockedSenders]
; Addresses or wildcards (*@spamdomain.com) that are always SPAM

[BlockedIPs]
; IP addresses or wildcards (203.0.113.*) that are always SPAM

[AllowedSenders]
; Addresses or wildcards that skip the content rules (form checks still apply)
`

const INVISIBLE_CHARS = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g
const COMBINING_MARKS = /\p{M}+/gu

/**
 * Normalises text for matching: compatibility forms (fullwidth, ligatures,
 * styled letters) folded by NFKC, invisible characters removed, Turkish
 * dotted/dotless i unified, accents stripped, whitespace collapsed.
 * `cаsіnо` with Cyrillic letters is still caught by the charset rule.
 *
 * @param {string} text
 * @returns {string}
 * @example
 *   normalizeForMatch('Ｃ​ASİNO') // → 'casino'
 */
export const normalizeForMatch = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Matches text against a `*` wildcard pattern covering the whole text
 * (`*x*` contains, `x*` starts with, `*x` ends with, `x` equals). Runs in
 * linear passes with indexOf, so it is safe on untrusted input.
 *
 * @param {string} text Normalised text.
 * @param {string} pattern Normalised pattern.
 * @returns {boolean}
 * @example
 *   matchWildcard('buy seo backlinks now', '*backlinks*') // → true
 */
export const matchWildcard = (text: string, pattern: string): boolean => {
  const parts = pattern.split('*')
  if (parts.length === 1) return text === pattern
  const first = parts[0]
  const last = parts[parts.length - 1]
  if (!text.startsWith(first)) return false
  let position = first.length
  for (let i = 1; i < parts.length - 1; i++) {
    if (!parts[i]) continue
    const found = text.indexOf(parts[i], position)
    if (found === -1) return false
    position = found + parts[i].length
  }
  return text.length - position >= last.length && text.endsWith(last)
}

const SECTION_KEYS: Record<string, keyof Omit<SpamRules, 'settings'> | 'settings'> = {
  settings: 'settings',
  keywords: 'keywords',
  subjectpatterns: 'subjectPatterns',
  bodypatterns: 'bodyPatterns',
  senderpatterns: 'senderPatterns',
  disposabledomains: 'disposableDomains',
  blockedsenders: 'blockedSenders',
  blockedips: 'blockedIps',
  allowedsenders: 'allowedSenders',
}

const WEIGHTED_SECTIONS = new Set(['keywords', 'subjectPatterns', 'bodyPatterns', 'senderPatterns'])

const SETTING_NAMES: Record<string, keyof SpamSettings> = Object.fromEntries(
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof SpamSettings>).map((key) => [key.toLowerCase(), key]),
)

/**
 * Parses SPAM.INI. Invalid lines never break the filter: they are skipped
 * (or fall back to the default setting) and reported as warnings with
 * their line number, which EDIT shows right after saving.
 *
 * @param {string} text
 * @returns {{ rules: SpamRules, warnings: string[] }}
 * @example
 *   const { rules, warnings } = parseSpamRules(fileContent)
 */
export const parseSpamRules = (text: string): { rules: SpamRules; warnings: string[] } => {
  const warnings: string[] = []
  const rules: SpamRules = {
    settings: { ...DEFAULT_SETTINGS },
    keywords: [],
    subjectPatterns: [],
    bodyPatterns: [],
    senderPatterns: [],
    disposableDomains: [],
    blockedSenders: [],
    blockedIps: [],
    allowedSenders: [],
  }
  let section: string | null = null
  const warn = (line: number, message: string) => warnings.push(`${MAIL_RULES_FILE} line ${line}: ${message}`)

  ;(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((rawLine, index) => {
    const lineNo = index + 1
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) return
    const header = line.match(/^\[(.+)\]$/)
    if (header) {
      section = SECTION_KEYS[header[1].trim().toLowerCase()] || null
      if (!section) warn(lineNo, `unknown section [${header[1].trim()}], ignored`)
      return
    }
    if (!section) return

    if (section === 'settings') {
      const eq = line.indexOf('=')
      const key = SETTING_NAMES[line.slice(0, Math.max(eq, 0)).trim().toLowerCase()]
      if (eq <= 0 || !key) {
        warn(lineNo, `unknown setting "${line}", ignored`)
        return
      }
      const value = line.slice(eq + 1).trim()
      if (key === 'mode') {
        const mode = value.toLowerCase()
        if (mode === 'enforce' || mode === 'tag-only' || mode === 'off') rules.settings.mode = mode
        else warn(lineNo, `Mode must be enforce, tag-only or off; using ${DEFAULT_SETTINGS.mode}`)
        return
      }
      const [min, max] = SETTING_BOUNDS[key]
      const number = Number(value)
      if (!Number.isInteger(number) || number < min || number > max) {
        const iniName = `${key.charAt(0).toUpperCase()}${key.slice(1)}`
        warn(lineNo, `${iniName} must be a whole number between ${min} and ${max}; using ${DEFAULT_SETTINGS[key]}`)
        return
      }
      ;(rules.settings[key] as number) = number
      return
    }

    const list = rules[section as keyof Omit<SpamRules, 'settings'>] as Array<WeightedEntry | string>
    if (list.length >= MAX_ENTRIES_PER_SECTION) {
      warn(lineNo, `more than ${MAX_ENTRIES_PER_SECTION} entries, ignored`)
      return
    }
    if (WEIGHTED_SECTIONS.has(section)) {
      const weighted = line.match(/^(.*?)\s*=\s*(-?\d+)$/)
      const label = (weighted ? weighted[1] : line).trim()
      const score = weighted ? Number(weighted[2]) : DEFAULT_ENTRY_SCORE
      const pattern = normalizeForMatch(label)
      if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
        warn(lineNo, `pattern is empty or longer than ${MAX_PATTERN_LENGTH} characters, ignored`)
        return
      }
      if (score < 0 || score > SPAM_MAX_SCORE) {
        warn(lineNo, `score must be between 0 and ${SPAM_MAX_SCORE}, ignored`)
        return
      }
      ;(list as WeightedEntry[]).push({ pattern, score, label })
      return
    }
    const value = normalizeForMatch(line)
    if (value.length > MAX_PATTERN_LENGTH) {
      warn(lineNo, `entry longer than ${MAX_PATTERN_LENGTH} characters, ignored`)
      return
    }
    ;(list as string[]).push(value)
  })

  if (rules.settings.reviewScore > rules.settings.rejectScore) {
    warnings.push(`${MAIL_RULES_FILE}: ReviewScore is above RejectScore; using ${DEFAULT_SETTINGS.reviewScore}/${DEFAULT_SETTINGS.rejectScore}`)
    rules.settings.reviewScore = DEFAULT_SETTINGS.reviewScore
    rules.settings.rejectScore = DEFAULT_SETTINGS.rejectScore
  }
  return { rules, warnings }
}

/**
 * Creates C:\MAIL\SPAM.INI with the default rules when it is missing.
 *
 * @returns {boolean} Whether the file was created.
 */
export const ensureSpamRulesFile = (): boolean => {
  const root = resolveVfsPath(MAIL_ROOT_PATH, { includeHidden: true })
  if (!root || findChild(root.id, MAIL_RULES_FILE)) return false
  createNode(root.id, { name: MAIL_RULES_FILE, type: 'file', content: DEFAULT_SPAM_INI.replace(/\n/g, '\r\n') })
  return true
}

/**
 * Loads the current rules from C:\MAIL\SPAM.INI (defaults when missing).
 *
 * @returns {SpamRules}
 * @example
 *   const { settings } = loadSpamRules()
 */
export const loadSpamRules = (): SpamRules => {
  const file = resolveVfsPath(MAIL_RULES_PATH, { includeHidden: true })
  const { rules, warnings } = parseSpamRules(file?.type === 'file' ? file.content || '' : DEFAULT_SPAM_INI)
  if (warnings.length && import.meta.dev) console.log('[mail] spam rules warnings', warnings)
  return rules
}

let formSecret: string | null = null

const getFormSecret = (): string => {
  if (formSecret) return formSecret
  const configured = String(useRuntimeConfig().mailFormSecret || '')
  if (configured.length >= FORM_SECRET_MIN_LENGTH) {
    formSecret = configured
  } else {
    formSecret = randomBytes(32).toString('hex')
    console.warn('[mail] NUXT_MAIL_FORM_SECRET is not set; using a per-process secret (open forms expire on restart)')
  }
  return formSecret
}

const signTimestamp = (timestamp: string): string =>
  createHmac('sha256', getFormSecret()).update(`mail-form:${timestamp}`).digest('hex').slice(0, FORM_TOKEN_SIGNATURE_CHARS)

/**
 * Issues a signed timestamp the mail window sends back with the form, so
 * the server can tell how long the form was open without trusting the
 * client clock.
 *
 * @returns {string} `timestamp.signature`
 * @example
 *   return { token: issueFormToken() }
 */
export const issueFormToken = (): string => {
  const timestamp = String(Date.now())
  return `${timestamp}.${signTimestamp(timestamp)}`
}

export type FormTokenCheck =
  | { ok: true; fillMs: number }
  | { ok: false; reason: 'missing' | 'bad-signature' | 'too-fast' | 'expired'; fillMs?: number }

/**
 * Verifies a form token against the fill-time limits.
 *
 * @param {unknown} token
 * @param {SpamSettings} settings
 * @returns {FormTokenCheck}
 */
export const verifyFormToken = (token: unknown, settings: SpamSettings): FormTokenCheck => {
  if (typeof token !== 'string' || !/^\d{1,15}\.[a-f0-9]+$/.test(token)) return { ok: false, reason: 'missing' }
  const [timestamp, signature] = token.split('.')
  const expected = signTimestamp(timestamp)
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, reason: 'bad-signature' }
  }
  const fillMs = Date.now() - Number(timestamp)
  if (fillMs < settings.minFillSeconds * 1000) return { ok: false, reason: 'too-fast', fillMs }
  if (fillMs > settings.maxFillMinutes * 60 * 1000) return { ok: false, reason: 'expired', fillMs }
  return { ok: true, fillMs }
}

export type MxCheck = 'ok' | 'no-mx' | 'no-domain' | 'unknown'
const mxCache = new Map<string, { result: MxCheck; at: number }>()

/**
 * Checks that the sender's domain can receive mail. Network problems
 * return `unknown` (never penalised); results are cached for an hour.
 *
 * @param {string} domain
 * @returns {Promise<MxCheck>}
 * @example
 *   await checkMailDomain('gmail.com') // → 'ok'
 */
export const checkMailDomain = async (domain: string): Promise<MxCheck> => {
  const cached = mxCache.get(domain)
  if (cached && Date.now() - cached.at < MX_CACHE_TTL_MS) return cached.result
  const timeout = new Promise<MxCheck>((resolve) => setTimeout(() => resolve('unknown'), MX_TIMEOUT_MS))
  const lookup = dns
    .resolveMx(domain)
    .then((records): MxCheck => (records.length ? 'ok' : 'no-mx'))
    .catch((error: NodeJS.ErrnoException): MxCheck => {
      if (error.code === 'ENOTFOUND') return 'no-domain'
      if (error.code === 'ENODATA') return 'no-mx'
      return 'unknown'
    })
  const result = await Promise.race([lookup, timeout])
  if (result !== 'unknown') mxCache.set(domain, { result, at: Date.now() })
  return result
}

export interface SpamContext {
  subject: string
  sender: string
  content: string
  ip: string
  origin: 'ok' | 'missing' | 'mismatch'
  token: FormTokenCheck
  duplicates: number
  mx: MxCheck
}

export interface SpamResult {
  score: number
  verdict: MailVerdict
  reasons: string[]
}

type RuleHit = { score: number; reason: string }

const URL_PATTERN = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|ru|cn|info|biz|xyz|top|click|link|live|io|me|site|online|shop)\b/gi
const HAS_URL = new RegExp(URL_PATTERN.source, 'i')
const SHORTENERS = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|tiny\.cc|ow\.ly|t\.ly|s\.id)\//i
const MARKUP = /<\s*a\s|href\s*=|\[url\b|\[link\b/i
const CYRILLIC = /[\u0400-\u04ff]/
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/
const REPEATED_PUNCTUATION = /([!?$€₺*])\1{3,}/
const REPEATED_CHARACTER = /(.)\1{7,}/
const CAPS_MIN_LETTERS = 15
const CAPS_RATIO = 0.6
const SHORT_BODY_CHARS = 25

const capsRatio = (text: string): number => {
  const letters = text.match(/\p{L}/gu) || []
  if (letters.length < CAPS_MIN_LETTERS) return 0
  return letters.filter((c) => c !== c.toLowerCase()).length / letters.length
}

const listMatches = (value: string, list: string[]) => list.some((entry) => matchWildcard(value, entry))

const formRules = (ctx: SpamContext): RuleHit[] => {
  const hits: RuleHit[] = []
  if (!ctx.token.ok) {
    const fill = ctx.token.fillMs !== undefined ? `(${ctx.token.fillMs}ms)` : ''
    const score = ctx.token.reason === 'expired' ? 60 : SPAM_MAX_SCORE
    hits.push({ score, reason: `form-token-${ctx.token.reason}${fill}` })
  }
  if (ctx.origin === 'mismatch') hits.push({ score: SPAM_MAX_SCORE, reason: 'origin-mismatch' })
  if (ctx.origin === 'missing') hits.push({ score: 50, reason: 'origin-missing' })
  return hits
}

const contentRules = (ctx: SpamContext, rules: SpamRules): RuleHit[] => {
  const hits: RuleHit[] = []
  const subject = normalizeForMatch(ctx.subject)
  const content = normalizeForMatch(ctx.content)
  const sender = normalizeForMatch(ctx.sender)
  const everything = `${subject}\n${content}\n${sender}`
  const raw = `${ctx.subject}\n${ctx.content}`

  if (CYRILLIC.test(raw)) hits.push({ score: 50, reason: 'cyrillic-charset' })
  else if (CJK.test(raw)) hits.push({ score: 50, reason: 'cjk-charset' })
  const invisible = (raw.match(INVISIBLE_CHARS) || []).length
  if (invisible) hits.push({ score: 30, reason: `invisible-chars(${invisible})` })

  const links = (ctx.content.match(URL_PATTERN) || []).length
  if (links > rules.settings.maxLinks) hits.push({ score: Math.min(SPAM_MAX_SCORE, (links - rules.settings.maxLinks) * 25), reason: `link-density(${links})` })
  if (HAS_URL.test(ctx.subject)) hits.push({ score: 50, reason: 'subject-link' })
  if (SHORTENERS.test(raw)) hits.push({ score: 30, reason: 'url-shortener' })
  if (MARKUP.test(raw)) hits.push({ score: 40, reason: 'html-or-bbcode-link' })
  if (content.length < SHORT_BODY_CHARS && links > 0) hits.push({ score: 40, reason: 'short-body-with-link' })

  if (capsRatio(ctx.subject) > CAPS_RATIO || capsRatio(ctx.content) > CAPS_RATIO) hits.push({ score: 25, reason: 'all-caps' })
  if (REPEATED_PUNCTUATION.test(raw)) hits.push({ score: 20, reason: 'repeated-punctuation' })
  if (REPEATED_CHARACTER.test(raw)) hits.push({ score: 15, reason: 'repeated-characters' })
  if (subject && subject === content) hits.push({ score: 20, reason: 'subject-equals-body' })

  if (ctx.duplicates > 0) hits.push({ score: 60, reason: `duplicate(${ctx.duplicates})` })

  const domain = sender.split('@')[1] || ''
  if (rules.disposableDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) hits.push({ score: 70, reason: `disposable-email(${domain})` })
  if (ctx.mx === 'no-domain') hits.push({ score: 80, reason: `no-such-domain(${domain})` })
  if (ctx.mx === 'no-mx') hits.push({ score: 40, reason: `no-mx(${domain})` })

  rules.keywords.filter((k) => everything.includes(k.pattern)).forEach((k) => hits.push({ score: k.score, reason: `keyword(${k.label})` }))
  rules.subjectPatterns.filter((p) => matchWildcard(subject, p.pattern)).forEach((p) => hits.push({ score: p.score, reason: `subject-pattern(${p.label})` }))
  rules.bodyPatterns.filter((p) => matchWildcard(content, p.pattern)).forEach((p) => hits.push({ score: p.score, reason: `body-pattern(${p.label})` }))
  rules.senderPatterns.filter((p) => matchWildcard(sender, p.pattern)).forEach((p) => hits.push({ score: p.score, reason: `sender-pattern(${p.label})` }))
  return hits
}

/**
 * Scores a submission. Form checks (token, origin) and block lists always
 * apply; senders on [AllowedSenders] skip only the content rules, so a
 * forged "allowed" address does not let a bot through.
 *
 * @param {SpamContext} ctx
 * @param {SpamRules} rules
 * @returns {SpamResult}
 * @example
 *   const { verdict, score, reasons } = evaluateSpam(ctx, loadSpamRules())
 */
export const evaluateSpam = (ctx: SpamContext, rules: SpamRules): SpamResult => {
  const sender = normalizeForMatch(ctx.sender)
  const hits = formRules(ctx)
  if (listMatches(sender, rules.blockedSenders)) hits.push({ score: SPAM_MAX_SCORE, reason: 'blocked-sender' })
  if (listMatches(ctx.ip, rules.blockedIps)) hits.push({ score: SPAM_MAX_SCORE, reason: 'blocked-ip' })
  if (listMatches(sender, rules.allowedSenders)) hits.push({ score: 0, reason: 'allowed-sender' })
  else hits.push(...contentRules(ctx, rules))

  const score = Math.min(SPAM_MAX_SCORE, hits.reduce((sum, hit) => sum + hit.score, 0))
  const verdict: MailVerdict = score >= rules.settings.rejectScore ? 'reject' : score >= rules.settings.reviewScore ? 'review' : 'pass'
  return { score, verdict, reasons: hits.map((hit) => hit.reason) }
}

/**
 * Warnings for SPAM.INI, used by the write endpoints so EDIT/COPY report
 * mistakes in the rules file as soon as it is saved.
 *
 * @param {string[]} canonicalPaths
 * @returns {string[]}
 */
export const collectSpamRulesWarnings = (canonicalPaths: string[]): string[] => {
  if (!canonicalPaths.some((p) => p.toUpperCase() === MAIL_RULES_PATH.toUpperCase())) return []
  const file = resolveVfsPath(MAIL_RULES_PATH, { includeHidden: true })
  return file?.type === 'file' ? parseSpamRules(file.content || '').warnings : []
}
