const DRIVE_C = 'C:'
const SHORT_BASE_MAX = 8
const SHORT_EXT_MAX = 3
const DIR_SIZE_FIELD_WIDTH = 14
const SUMMARY_COUNT_WIDTH = 10
const INVALID_SHORT_NAME_CHAR = /[^A-Z0-9!#$%&'()\-@^_`{}~]/
const INVALID_SHORT_NAME_CHARS = /[^A-Z0-9!#$%&'()\-@^_`{}~]/g

/**
 * Replaces `{key}` placeholders in a message template.
 *
 * @param {string} template
 * @param {Record<string, string|number>} [values]
 * @returns {string}
 * @example
 *   fillTemplate('File not found - {name}', { name: 'A.TXT' })
 */
export const fillTemplate = (template, values = {}) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match))

/**
 * Splits a command line into the command word, positional arguments and
 * switches. Supports quoted arguments and DOS shorthands such as `CD..`,
 * `CD\` and `DIR/A` where no space follows the command.
 *
 * @param {string} input
 * `rest` is the raw text after the command word (ECHO needs it verbatim).
 *
 * @returns {{ command: string, args: string[], switches: string[], rest: string }}
 * @example
 *   parseCommandLine('dir "C:\\My Docs" /a') // → { command: 'DIR', args: ['C:\\My Docs'], switches: ['A'] }
 */
export const parseCommandLine = (input) => {
  const trimmed = input.trim()
  const head = trimmed.match(/^([a-z]+)(.*)$/i)
  const command = (head ? head[1] : trimmed.split(/\s+/)[0] || '').toUpperCase()
  const rest = head ? head[2] : trimmed.slice(command.length)

  const tokens = rest.match(/"[^"]*"|[^\s"]+/g) || []
  const args = []
  const switches = []
  tokens.forEach((token) => {
    if (token.startsWith('"')) {
      args.push(token.slice(1, -1))
      return
    }
    const parts = token.split('/')
    if (parts[0]) args.push(parts[0])
    parts.slice(1).filter(Boolean).forEach((s) => switches.push(s.toUpperCase()))
  })
  return { command, args, switches, rest }
}

/**
 * Splits a trailing output redirection (`> FILE` or `>> FILE`) off a
 * command's raw text. A `>` inside double quotes is not a redirection.
 *
 * @param {string} text Raw text after the command word.
 * @returns {{ text: string, target: string|null, append: boolean }}
 *   `target` is null without redirection and `''` when `>` names no file.
 * @example
 *   splitRedirect(' Hello >> NOTES.TXT') // → { text: ' Hello', target: 'NOTES.TXT', append: true }
 */
export const splitRedirect = (text) => {
  const match = text.match(/^((?:[^">]|"[^"]*")*)(>>?)\s*("[^"]*"|[^\s"]+)?\s*$/)
  if (!match) return { text, target: null, append: false }
  return {
    text: match[1].trimEnd(),
    target: match[3] ? match[3].replace(/^"|"$/g, '') : '',
    append: match[2] === '>>',
  }
}

/**
 * Formats one ATTRIB output line in the Windows 95 column layout. The
 * archive and system columns stay blank: this file system has neither.
 *
 * @param {{ hidden: boolean, readonly: boolean }} entry
 * @param {string} path Canonical path printed after the attribute columns.
 * @returns {string}
 * @example
 *   formatAttribLine({ hidden: true, readonly: false }, 'C:\\SECRET.TXT') // → '      H      C:\\SECRET.TXT'
 */
export const formatAttribLine = (entry, path) =>
  `      ${entry.hidden ? 'H' : ' '}${entry.readonly ? 'R' : ' '}     ${path}`

const MAIL_ROW_NUMBER_WIDTH = 3
const MAIL_ROW_DATE_CHARS = 16
const MAIL_ROW_SCORE_WIDTH = 3
const MAIL_ROW_FROM_WIDTH = 26
const MAIL_ROW_SUBJECT_WIDTH = 30

const fit = (text, width) => (text.length > width ? `${text.slice(0, width - 1)}~` : text.padEnd(width))

/**
 * Formats one line of the `MAIL` listing: number, date, spam score,
 * sender and subject in fixed columns.
 *
 * @param {number} number 1-based message number (used by `MAIL n`).
 * @param {{ date: string, score: string, from: string, subject: string }} message
 * @returns {string}
 * @example
 *   formatMailRow(1, { date: '2026-11-16 15:30:05', score: '20 (pass)', from: 'a@b.com', subject: 'Hi' })
 */
export const formatMailRow = (number, message) =>
  [
    `${String(number).padStart(MAIL_ROW_NUMBER_WIDTH)}.`,
    message.date.slice(0, MAIL_ROW_DATE_CHARS).padEnd(MAIL_ROW_DATE_CHARS),
    String(Number.parseInt(message.score, 10) || 0).padStart(MAIL_ROW_SCORE_WIDTH),
    fit(message.from, MAIL_ROW_FROM_WIDTH),
    fit(message.subject, MAIL_ROW_SUBJECT_WIDTH).trimEnd(),
  ].join('  ')

/**
 * Whether a DOS argument contains `*` or `?`.
 *
 * @param {string} text
 * @returns {boolean}
 * @example
 *   hasWildcard('*.TXT') // → true
 */
export const hasWildcard = (text) => /[*?]/.test(text)

const wildcardRegExp = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')

/**
 * Matches a long file name against a DOS wildcard, case-insensitively.
 * `*.*` matches every name, `NAME.*` also matches `NAME` without an
 * extension and `*.` matches only names without one, as in Windows 95.
 *
 * @param {string} name
 * @param {string} pattern
 * @returns {boolean}
 * @example
 *   matchesWildcard('Phase1.txt', 'PHASE?.TXT') // → true
 */
export const matchesWildcard = (name, pattern) => {
  if (pattern === '*' || pattern === '*.*') return true
  if (pattern.endsWith('.*')) return wildcardRegExp(pattern).test(name) || wildcardRegExp(pattern.slice(0, -2)).test(name)
  if (pattern.endsWith('.')) return !name.includes('.') && wildcardRegExp(pattern.slice(0, -1)).test(name)
  return wildcardRegExp(pattern).test(name)
}

const splitExtension = (name) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, '']
}

const applyPatternPart = (source, pattern) => {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') return `${out}${source.slice(i)}`
    out += pattern[i] === '?' ? source[i] || '' : pattern[i]
  }
  return out
}

/**
 * Builds the target name of a wildcard REN the way DOS does: `?` keeps
 * the source character at that position and `*` keeps the rest of the
 * source name (or extension).
 *
 * @param {string} name Source file name.
 * @param {string} pattern Target pattern, e.g. `*.BAK`.
 * @returns {string}
 * @example
 *   applyRenamePattern('NOTES.TXT', '*.BAK') // → 'NOTES.BAK'
 */
export const applyRenamePattern = (name, pattern) => {
  if (!pattern.includes('.')) return applyPatternPart(name, pattern)
  const [base, ext] = splitExtension(name)
  const [patternBase, patternExt] = splitExtension(pattern)
  const newBase = applyPatternPart(base, patternBase)
  const newExt = applyPatternPart(ext, patternExt)
  return newExt ? `${newBase}.${newExt}` : newBase
}

/**
 * Joins a canonical directory path and an entry name.
 *
 * @param {string} dir e.g. `C:\` or `C:\MBURAKBILGIC`
 * @param {string} name
 * @returns {string}
 * @example
 *   joinDosPath('C:\\', 'AUTOEXEC.BAT') // → 'C:\\AUTOEXEC.BAT'
 */
export const joinDosPath = (dir, name) => (dir.endsWith('\\') ? `${dir}${name}` : `${dir}\\${name}`)

/**
 * Whether `path` is `ancestor` itself or lies inside it (case-insensitive).
 *
 * @param {string} path
 * @param {string} ancestor
 * @returns {boolean}
 * @example
 *   isSameOrInside('C:\\MBURAKBILGIC\\BIO', 'c:\\mburakbilgic') // → true
 */
export const isSameOrInside = (path, ancestor) => {
  const p = path.toUpperCase()
  const a = ancestor.toUpperCase().replace(/\\$/, '')
  return p === a || p.startsWith(`${a}\\`)
}

/**
 * Resolves a DOS path argument against the current directory. Accepts
 * `\` and `/`, `.`/`..`, drive-relative (`\X`) and absolute (`C:\X`)
 * forms. Only drive C exists; A: behaves like an empty floppy drive.
 *
 * @param {string} cwd Canonical current directory, e.g. `C:\MBURAKBILGIC`.
 * @param {string} arg
 * @returns {{ path: string } | { error: 'invalidDrive' | 'driveNotReady', drive: string }}
 * @example
 *   resolveDosPath('C:\\MBURAKBILGIC', '..\\') // → { path: 'C:\\' }
 */
export const resolveDosPath = (cwd, arg) => {
  let raw = (arg || '').replace(/\//g, '\\')
  const driveMatch = raw.match(/^([a-z]):/i)
  if (driveMatch) {
    const drive = `${driveMatch[1].toUpperCase()}:`
    if (drive === 'A:') return { error: 'driveNotReady', drive: 'A' }
    if (drive !== DRIVE_C) return { error: 'invalidDrive', drive: driveMatch[1].toUpperCase() }
    raw = raw.slice(2)
  }
  const baseSegments = raw.startsWith('\\') ? [] : cwd.split('\\').slice(1).filter(Boolean)
  const segments = [...baseSegments]
  raw.split('\\').filter(Boolean).forEach((segment) => {
    if (segment === '.') return
    if (segment === '..') {
      segments.pop()
      return
    }
    segments.push(segment)
  })
  return { path: `${DRIVE_C}\\${segments.join('\\')}` }
}

const toShortName = (name, taken) => {
  const upper = name.toUpperCase()
  const dot = upper.lastIndexOf('.')
  const base = dot > 0 ? upper.slice(0, dot) : upper
  const ext = dot > 0 ? upper.slice(dot + 1) : ''
  const fits =
    base.length > 0 &&
    base.length <= SHORT_BASE_MAX &&
    ext.length <= SHORT_EXT_MAX &&
    !INVALID_SHORT_NAME_CHAR.test(base) &&
    !INVALID_SHORT_NAME_CHAR.test(ext)
  if (fits && !taken.has(`${base}.${ext}`)) {
    taken.add(`${base}.${ext}`)
    return { base, ext }
  }
  const cleanBase = base.replace(INVALID_SHORT_NAME_CHARS, '') || 'FILE'
  const cleanExt = ext.replace(INVALID_SHORT_NAME_CHARS, '').slice(0, SHORT_EXT_MAX)
  for (let n = 1; ; n++) {
    const suffix = `~${n}`
    const shortBase = cleanBase.slice(0, SHORT_BASE_MAX - suffix.length) + suffix
    if (!taken.has(`${shortBase}.${cleanExt}`)) {
      taken.add(`${shortBase}.${cleanExt}`)
      return { base: shortBase, ext: cleanExt }
    }
  }
}

const formatDate = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  const hours = d.getHours() % 12 || 12
  return {
    date: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getFullYear() % 100)}`,
    time: `${String(hours).padStart(2, ' ')}:${pad(d.getMinutes())}${d.getHours() < 12 ? 'a' : 'p'}`,
  }
}

const formatBytes = (n) => n.toLocaleString('en-US')

/**
 * Formats a directory listing exactly like the Win95 `DIR` command:
 * 8.3 short name, size or `<DIR>`, date, time and the long name.
 *
 * @param {{ path: string, updatedAt: string, entries: Array<{ name: string, type: 'dir'|'file', size: number, updatedAt: string, hidden: boolean }> }} listing
 * @param {{ showHidden: boolean, hideDots?: boolean, labels: object, volumeLabel: string, volumeSerial: string }} options
 * @returns {string[]}
 * @example
 *   formatDirListing(await $fetch('/api/fs/list?path=C:\\'), { showHidden: false, labels: dos.dir, ... })
 */
export const formatDirListing = (listing, { showHidden, hideDots = false, labels, volumeLabel, volumeSerial }) => {
  const entries = listing.entries.filter((e) => showHidden || !e.hidden)
  const taken = new Set()
  const showDots = listing.path !== `${DRIVE_C}\\` && !hideDots
  const row = (short, isDir, size, iso, longName) => {
    const { date, time } = formatDate(iso)
    const sizeField = isDir
      ? `   ${labels.dirTag}`.padEnd(DIR_SIZE_FIELD_WIDTH)
      : formatBytes(size).padStart(DIR_SIZE_FIELD_WIDTH)
    return `${short.base.padEnd(SHORT_BASE_MAX)} ${short.ext.padEnd(SHORT_EXT_MAX)}${sizeField}  ${date}  ${time} ${longName}`
  }

  const lines = [
    fillTemplate(labels.volume, { label: volumeLabel }),
    fillTemplate(labels.serial, { serial: volumeSerial }),
    fillTemplate(labels.directoryOf, { path: listing.path }),
    '',
  ]
  if (showDots) {
    lines.push(row({ base: '.', ext: '' }, true, 0, listing.updatedAt, '.'))
    lines.push(row({ base: '..', ext: '' }, true, 0, listing.updatedAt, '..'))
  }
  let fileCount = 0
  let dirCount = showDots ? 2 : 0
  let totalBytes = 0
  entries.forEach((entry) => {
    const isDir = entry.type === 'dir'
    if (isDir) dirCount++
    else {
      fileCount++
      totalBytes += entry.size
    }
    lines.push(row(toShortName(entry.name, taken), isDir, entry.size, entry.updatedAt, entry.name))
  })
  lines.push(
    `${String(fileCount).padStart(SUMMARY_COUNT_WIDTH)} ${labels.files} ${formatBytes(totalBytes).padStart(DIR_SIZE_FIELD_WIDTH)} ${labels.bytes}`,
    `${String(dirCount).padStart(SUMMARY_COUNT_WIDTH)} ${labels.dirs}`,
  )
  return lines
}

/**
 * Formats a folder tree with the box-drawing characters of Win95 `TREE`.
 *
 * @param {{ path: string, children: Array<{ name: string, type: 'dir'|'file', children?: Array<object> }> }} tree
 * @param {{ includeFiles: boolean, labels: object, volumeLabel: string, volumeSerial: string }} options
 * @returns {string[]}
 * @example
 *   formatTree(await $fetch('/api/fs/tree?path=C:\\&files=1'), { includeFiles: true, ... })
 */
export const formatTree = (tree, { includeFiles, labels, volumeLabel, volumeSerial }) => {
  const lines = [
    fillTemplate(labels.header, { label: volumeLabel }),
    fillTemplate(labels.serial, { serial: volumeSerial }),
    tree.path,
  ]
  const walk = (children, prefix) => {
    const files = children.filter((c) => c.type === 'file')
    const dirs = children.filter((c) => c.type === 'dir')
    if (includeFiles && files.length) {
      files.forEach((f) => lines.push(`${prefix}${dirs.length ? '│   ' : '    '}${f.name}`))
      lines.push(`${prefix}${dirs.length ? '│' : ''}`)
    }
    dirs.forEach((d, index) => {
      const last = index === dirs.length - 1
      lines.push(`${prefix}${last ? '└───' : '├───'}${d.name}`)
      walk(d.children || [], `${prefix}${last ? '    ' : '│   '}`)
    })
  }
  walk(tree.children, '')
  if (!tree.children.some((c) => c.type === 'dir') && !(includeFiles && tree.children.length)) {
    lines.push(labels.noSubfolders)
  }
  return lines
}
