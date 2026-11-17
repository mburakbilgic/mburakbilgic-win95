export const MAIL_ROOT_PATH = `${VFS_DRIVE}\\MAIL`
export const MAIL_FOLDERS = { pass: 'INBOX', review: 'REVIEW', reject: 'SPAM' } as const
export const MAIL_RULES_FILE = 'SPAM.INI'
export const MAIL_RULES_PATH = `${MAIL_ROOT_PATH}\\${MAIL_RULES_FILE}`
export const MAIL_PROTECTED_PATHS = [MAIL_ROOT_PATH, ...Object.values(MAIL_FOLDERS).map((f) => `${MAIL_ROOT_PATH}\\${f}`)]
export const MAIL_MESSAGE_EXTENSION = 'MSG'
const LAST_LOGIN_META_KEY = 'lastAdminLogin'
const MESSAGE_SUBJECT_MAX_CHARS = 50
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g

export type MailVerdict = keyof typeof MAIL_FOLDERS

export interface StoredMessage {
  sender: string
  subject: string
  content: string
  ip: string
  userAgent: string
  receivedAt: Date
  score: number
  verdict: MailVerdict
  reasons: string[]
  mailed: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Formats a date in server local time, e.g. `2026-11-16 15:30:05`.
 *
 * @param {Date} date
 * @returns {string}
 */
export const formatMailDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

const singleLine = (value: string): string => value.replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim()

const mailRoot = (): VfsNode | null => resolveVfsPath(MAIL_ROOT_PATH, { includeHidden: true })

const mailFolder = (verdict: MailVerdict): VfsNode | null =>
  resolveVfsPath(`${MAIL_ROOT_PATH}\\${MAIL_FOLDERS[verdict]}`, { includeHidden: true })

/**
 * Creates `C:\MAIL` (hidden) and its INBOX/REVIEW/SPAM folders when they
 * are missing, and re-hides the root if it was ever un-hidden, so stored
 * messages are never visible to visitors. Idempotent; runs at boot.
 *
 * @returns {boolean} Whether anything was created or repaired.
 * @example
 *   if (ensureMailTree()) console.info('[mail] mailbox created')
 */
export const ensureMailTree = (): boolean =>
  useDb().transaction(() => {
    let changed = false
    let root = mailRoot()
    if (!root) {
      root = createNode(getRootNode().id, { name: 'MAIL', type: 'dir', hidden: true })
      changed = true
    } else if (!root.hidden) {
      updateNode(root.id, { hidden: true })
      changed = true
    }
    for (const name of Object.values(MAIL_FOLDERS)) {
      if (!findChild(root.id, name)) {
        createNode(root.id, { name, type: 'dir' })
        changed = true
      }
    }
    return changed
  })()

const messageFileName = (folder: VfsNode, receivedAt: Date, subject: string): string => {
  const stamp = `${receivedAt.getFullYear()}${pad(receivedAt.getMonth() + 1)}${pad(receivedAt.getDate())}-${pad(receivedAt.getHours())}${pad(receivedAt.getMinutes())}${pad(receivedAt.getSeconds())}`
  const title = subject.replace(INVALID_FILE_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MESSAGE_SUBJECT_MAX_CHARS).replace(/[ .]+$/, '')
  const base = title ? `${stamp} ${title}` : stamp
  let name = `${base}.${MAIL_MESSAGE_EXTENSION}`
  for (let n = 2; findChild(folder.id, name); n++) name = `${base} (${n}).${MAIL_MESSAGE_EXTENSION}`
  return name
}

/**
 * Writes a received message into the folder matching its verdict as a
 * header document readable with TYPE. Header values are flattened to one
 * line so a crafted subject cannot forge extra headers.
 *
 * @param {StoredMessage} message
 * @returns {string} Canonical path of the new file.
 * @throws {Error} When the mailbox tree is missing (ensureMailTree not run).
 * @example
 *   saveMessage({ ...payload, verdict: 'pass', score: 0, reasons: [], mailed: 'yes', receivedAt: new Date(), ip, userAgent })
 */
export const saveMessage = (message: StoredMessage): string => {
  const folder = mailFolder(message.verdict)
  if (!folder) throw new Error(`Mail folder for ${message.verdict} is missing`)
  const content = stringifyHeaderDoc(
    {
      From: singleLine(message.sender),
      Subject: singleLine(message.subject),
      Date: formatMailDate(message.receivedAt),
      Score: `${message.score} (${message.verdict})`,
      Reasons: message.reasons.length ? singleLine(message.reasons.join(', ')) : '-',
      Mailed: message.mailed,
      IP: singleLine(message.ip),
      'User-Agent': singleLine(message.userAgent).slice(0, 300),
    },
    message.content,
  )
  const node = createNode(folder.id, { name: messageFileName(folder, message.receivedAt, message.subject), type: 'file', content })
  return vfsNodePath(node)
}

export interface MessageSummary {
  name: string
  date: string
  from: string
  subject: string
  score: string
}

/**
 * Lists every folder of the mailbox with a summary of each message,
 * newest first (message files sort by their timestamp prefix).
 *
 * @returns {Array<{ name: string, path: string, messages: MessageSummary[] }>}
 * @example
 *   listMailbox()[0].messages[0].subject
 */
export const listMailbox = () =>
  (Object.keys(MAIL_FOLDERS) as MailVerdict[]).map((verdict) => {
    const folder = mailFolder(verdict)
    const messages: MessageSummary[] = folder
      ? listChildren(folder.id, { includeHidden: true })
          .filter((n) => n.type === 'file')
          .map((n) => {
            const { headers } = parseHeaderDoc(n.content || '')
            return { name: n.name, date: headers.date || '', from: headers.from || '', subject: headers.subject || '', score: headers.score || '' }
          })
          .sort((a, b) => b.name.localeCompare(a.name))
      : []
    return { name: MAIL_FOLDERS[verdict], path: `${MAIL_ROOT_PATH}\\${MAIL_FOLDERS[verdict]}`, messages }
  })

/**
 * Records an admin login and returns how many INBOX/REVIEW messages
 * arrived since the previous one.
 *
 * @returns {number}
 * @example
 *   const newMessages = takeNewMessageCount()
 */
export const takeNewMessageCount = (): number => {
  const since = getMeta(LAST_LOGIN_META_KEY) || '1970-01-01T00:00:00.000Z'
  const folderIds = (['pass', 'review'] as MailVerdict[]).map((v) => mailFolder(v)?.id).filter((id): id is number => !!id)
  const count = folderIds.length
    ? (useDb()
        .prepare(`SELECT count(*) AS n FROM nodes WHERE type = 'file' AND created_at > ? AND parent_id IN (${folderIds.map(() => '?').join(',')})`)
        .get(since, ...folderIds) as { n: number }).n
    : 0
  setMeta(LAST_LOGIN_META_KEY, new Date().toISOString())
  return count
}

/**
 * Deletes SPAM messages older than the retention period and trims every
 * folder to its newest `maxPerFolder` messages, so a flood of junk can
 * never grow the database without bound.
 *
 * @param {{ spamRetentionDays: number, maxPerFolder: number }} limits
 * @returns {number} Number of deleted messages.
 * @example
 *   purgeMailbox({ spamRetentionDays: 30, maxPerFolder: 1000 })
 */
export const purgeMailbox = (limits: { spamRetentionDays: number; maxPerFolder: number }): number => {
  const db = useDb()
  let deleted = 0
  const spam = mailFolder('reject')
  if (spam) {
    const cutoff = new Date(Date.now() - limits.spamRetentionDays * 24 * 60 * 60 * 1000).toISOString()
    deleted += db.prepare("DELETE FROM nodes WHERE parent_id = ? AND type = 'file' AND created_at < ?").run(spam.id, cutoff).changes
  }
  for (const verdict of Object.keys(MAIL_FOLDERS) as MailVerdict[]) {
    const folder = mailFolder(verdict)
    if (!folder) continue
    deleted += db
      .prepare(
        `DELETE FROM nodes WHERE id IN (
           SELECT id FROM nodes WHERE parent_id = ? AND type = 'file'
           ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)`,
      )
      .run(folder.id, limits.maxPerFolder).changes
  }
  return deleted
}
