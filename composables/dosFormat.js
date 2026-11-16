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
 * @returns {{ command: string, args: string[], switches: string[] }}
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
  return { command, args, switches }
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
 * @param {{ showHidden: boolean, labels: object, volumeLabel: string, volumeSerial: string }} options
 * @returns {string[]}
 * @example
 *   formatDirListing(await $fetch('/api/fs/list?path=C:\\'), { showHidden: false, labels: dos.dir, ... })
 */
export const formatDirListing = (listing, { showHidden, labels, volumeLabel, volumeSerial }) => {
  const entries = listing.entries.filter((e) => showHidden || !e.hidden)
  const taken = new Set()
  const isDriveRoot = listing.path === `${DRIVE_C}\\`
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
  if (!isDriveRoot) {
    lines.push(row({ base: '.', ext: '' }, true, 0, listing.updatedAt, '.'))
    lines.push(row({ base: '..', ext: '' }, true, 0, listing.updatedAt, '..'))
  }
  let fileCount = 0
  let dirCount = isDriveRoot ? 0 : 2
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
