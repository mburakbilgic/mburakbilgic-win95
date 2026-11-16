export interface IniSection {
  name: string
  entries: Record<string, string>
}

const normalizeNewlines = (text: string): string => text.replace(/\r\n?/g, '\n')

/**
 * Parses Win95-style INI text. Section and key order is preserved; keys
 * are lower-cased so lookups are case-insensitive like the original
 * `GetPrivateProfileString`. Lines starting with `;` are comments.
 *
 * @param {string} text
 * @returns {IniSection[]}
 * @example
 *   parseIni('[Project]\nTitle=HRMS')[0].entries.title // → 'HRMS'
 */
export const parseIni = (text: string): IniSection[] => {
  const sections: IniSection[] = []
  let current: IniSection | null = null
  for (const rawLine of normalizeNewlines(text || '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';')) continue
    const header = line.match(/^\[(.+)\]$/)
    if (header) {
      current = { name: header[1].trim(), entries: {} }
      sections.push(current)
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0 || !current) continue
    current.entries[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim()
  }
  return sections
}

/**
 * Returns the entries of the first section with the given name
 * (case-insensitive), or an empty object.
 *
 * @param {IniSection[]} sections
 * @param {string} name
 * @returns {Record<string, string>}
 * @example
 *   iniSection(parseIni(text), 'shortcut').target
 */
export const iniSection = (sections: IniSection[], name: string): Record<string, string> =>
  sections.find((s) => s.name.toLowerCase() === name.toLowerCase())?.entries || {}

/**
 * Serialises sections back to INI text. Empty values are skipped.
 *
 * @param {Array<{ name: string, entries: Record<string, string|number|undefined|null> }>} sections
 * @returns {string}
 * @example
 *   stringifyIni([{ name: 'Site', entries: { Name: 'Burak' } }]) // → '[Site]\r\nName=Burak\r\n'
 */
export const stringifyIni = (
  sections: Array<{ name: string; entries: Record<string, string | number | undefined | null> }>,
): string =>
  sections
    .map((section) => {
      const lines = Object.entries(section.entries)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`)
      return [`[${section.name}]`, ...lines].join('\r\n')
    })
    .join('\r\n\r\n') + '\r\n'

export interface HeaderDoc {
  headers: Record<string, string>
  body: string
}

/**
 * Parses a text file made of `Key: value` header lines, a blank line and
 * a free-form body (like an e-mail). When the first line is not a header
 * the whole text is treated as body.
 *
 * @param {string} text
 * @returns {HeaderDoc} Header keys are lower-cased.
 * @example
 *   parseHeaderDoc('Title: Hi\n\nBody').headers.title // → 'Hi'
 */
export const parseHeaderDoc = (text: string): HeaderDoc => {
  const lines = normalizeNewlines(text || '').split('\n')
  const headers: Record<string, string> = {}
  let index = 0
  for (; index < lines.length; index++) {
    const match = lines[index].match(/^([A-Za-z][\w-]*):\s?(.*)$/)
    if (!match) break
    headers[match[1].toLowerCase()] = match[2].trim()
  }
  if (index > 0 && lines[index]?.trim() === '') index++
  return { headers, body: lines.slice(index).join('\n').trim() }
}

/**
 * Serialises headers and a body into header-document text.
 *
 * @param {Record<string, string|number|undefined|null>} headers
 * @param {string} body
 * @returns {string}
 * @example
 *   stringifyHeaderDoc({ Title: 'Hi' }, 'Body') // → 'Title: Hi\r\n\r\nBody\r\n'
 */
export const stringifyHeaderDoc = (
  headers: Record<string, string | number | undefined | null>,
  body: string,
): string => {
  const headerLines = Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${value}`)
  const parts = headerLines.length ? [headerLines.join('\r\n'), body] : [body]
  return parts.join('\r\n\r\n').replace(/\r?\n/g, '\r\n') + '\r\n'
}

/**
 * Splits a body into paragraphs separated by one or more blank lines.
 *
 * @param {string} body
 * @returns {string[]}
 * @example
 *   toParagraphs('a\n\nb') // → ['a', 'b']
 */
export const toParagraphs = (body: string): string[] =>
  normalizeNewlines(body || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
