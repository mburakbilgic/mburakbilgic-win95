export const CONTENT_HOME_DIR = 'MBURAKBILGIC'
export const CONTENT_HOME_PATH = `${VFS_DRIVE}\\${CONTENT_HOME_DIR}`

export const CONTENT_DIRS = {
  desktop: 'DESKTOP',
  bio: 'BIO',
  jobs: 'JOBS',
  projects: 'PROJECTS',
  techMonolith: 'TECHMON',
  photos: 'PHOTOS',
  social: 'SOCIAL',
} as const

export const CONTENT_FILES = {
  site: 'SITE.INI',
  about: 'ABOUT.TXT',
  badges: 'BADGES.INI',
  techMonolith: 'TECHMON.INI',
} as const

const IMAGE_EXTENSIONS = new Set(['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP'])

type Warn = (path: string, message: string) => void

const childOf = (dir: VfsNode | null, name: string): VfsNode | null => (dir ? findChild(dir.id, name) : null)

const visibleFiles = (dir: VfsNode | null, extension: string): VfsNode[] =>
  dir
    ? listChildren(dir.id).filter((n) => n.type === 'file' && fileExtension(n.name) === extension)
    : []

const readText = (node: VfsNode | null): string => (node && !node.hidden ? node.content || '' : '')

const localBlobUrl = (dir: VfsNode | null, name: string): string => {
  const node = dir && name ? findChild(dir.id, name) : null
  return node && !node.hidden && node.type === 'file' && node.blobKey ? blobUrl(node) : ''
}

const lastUrlSegment = (url: string): string => {
  const segment = url.split(/[?#]/)[0].split('/').pop() || ''
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Resolves an asset reference written in a content file:
 *  - `C:\...` absolute path → that uploaded file,
 *  - plain file name → uploaded file in the same directory,
 *  - URL or site path → an uploaded file in the same directory with the
 *    URL's file name if one exists (so uploading `onco-ai-web.PNG` next to
 *    `PHASE1.TXT` replaces the old bucket URL without editing it),
 *    otherwise the URL itself unless `localOnly` is set.
 */
const resolveAssetRef = (value: string | undefined, dir: VfsNode | null, options: { localOnly?: boolean } = {}): string => {
  const ref = (value || '').trim()
  if (!ref) return ''
  if (/^[a-z]:[\\/]/i.test(ref)) {
    const node = resolveVfsPath(ref)
    return node && node.type === 'file' && node.blobKey ? blobUrl(node) : ''
  }
  if (/^https?:\/\//i.test(ref) || ref.startsWith('/')) {
    return localBlobUrl(dir, lastUrlSegment(ref)) || (options.localOnly ? '' : ref)
  }
  return localBlobUrl(dir, ref)
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildSite = (home: VfsNode) => {
  const site = iniSection(parseIni(readText(childOf(home, CONTENT_FILES.site))), 'Site')
  return {
    name: site.name || '',
    headline: site.headline || '',
    location: site.location || '',
    birthYear: toInt(site.birthyear, 0),
    domain: site.domain || '',
    mailRecipientLabel: site.mailrecipientlabel || '',
    avatarPath: site.avatarpath || '',
    projectsAddressBar: site.projectsaddressbar || '',
  }
}

const buildBio = (home: VfsNode, warn: Warn) => {
  const bioDir = childOf(home, CONTENT_DIRS.bio)
  const about = parseHeaderDoc(readText(childOf(bioDir, CONTENT_FILES.about)))
  const badges = parseIni(readText(childOf(bioDir, CONTENT_FILES.badges)))
    .filter((s) => s.entries.src)
    .map((s) => ({ alt: s.name, src: s.entries.src }))
  const employment = visibleFiles(childOf(bioDir, CONTENT_DIRS.jobs), 'TXT')
    .map((file) => {
      const doc = parseHeaderDoc(file.content || '')
      if (!doc.headers.company) {
        warn(`BIO\\JOBS\\${file.name}`, 'missing "Company:" header, skipped')
        return null
      }
      return {
        id: file.name,
        company: doc.headers.company,
        period: doc.headers.period || '',
        role: doc.headers.role || '',
        description: doc.body,
      }
    })
    .filter((job) => job !== null)

  return {
    techBadges: badges,
    aboutIntroTemplate: about.headers.intro || '',
    aboutParagraphs: toParagraphs(about.body).map((text, index) => ({ id: `about-${index + 1}`, text })),
    employment,
    resumeLinkLabel: about.headers.resumelabel || '',
    resumeLocalPath: about.headers.resumepath || '',
    resumeUrl: resolveAssetRef(about.headers.resumepath, bioDir, { localOnly: true }),
  }
}

const buildProjects = (home: VfsNode, warn: Warn) =>
  visibleFiles(childOf(home, CONTENT_DIRS.projects), 'INI')
    .map((file) => {
      const p = iniSection(parseIni(file.content || ''), 'Project')
      if (!p.title) {
        warn(`PROJECTS\\${file.name}`, 'missing [Project] Title=, skipped')
        return null
      }
      return {
        id: baseName(file.name),
        title: p.title,
        owner: p.owner || '',
        repo: p.repo || '',
        branch: p.branch || '',
        description: p.description || '',
      }
    })
    .filter((p) => p !== null)

const buildTechMonolith = (home: VfsNode) => {
  const dir = childOf(home, CONTENT_DIRS.techMonolith)
  const meta = iniSection(parseIni(readText(childOf(dir, CONTENT_FILES.techMonolith))), 'TechMonolith')
  const phases = visibleFiles(dir, 'TXT').map((file) => {
    const doc = parseHeaderDoc(file.content || '')
    const id = baseName(file.name)
    return {
      id,
      title: doc.headers.title || baseName(file.name),
      paragraphs: toParagraphs(doc.body).map((text, index) => ({ id: `${id}-${index + 1}`, text })),
      ...(doc.headers.image
        ? { image: { url: resolveAssetRef(doc.headers.image, dir), caption: doc.headers.caption || '', variant: doc.headers.variant || 'full' } }
        : {}),
    }
  })
  return {
    logoUrl: resolveAssetRef(meta.logourl, dir),
    logoAlt: meta.logoalt || '',
    companyUrl: meta.companyurl || '',
    companyLabel: meta.companylabel || '',
    phases,
  }
}

interface FileEntry {
  id: number
  title: string
  type: 'folder' | 'photo' | 'file'
  altText: string
  size: number
  path: string
  src?: string
  fileType?: 'text' | 'pdf'
  content?: FileEntry[]
}

const toFileEntry = (node: VfsNode, path: string, allFiles: boolean): FileEntry | null => {
  const base = { id: node.id, title: node.name, altText: node.name, size: nodeSize(node), path }
  const src = node.blobKey ? blobUrl(node) : (node.content || '').trim()
  const isImage = node.blobKey ? node.mime?.startsWith('image/') : IMAGE_EXTENSIONS.has(fileExtension(node.name))
  if (isImage && src) return { ...base, type: 'photo', src }
  if (!allFiles) return null
  if (node.mime === 'application/pdf') return { ...base, type: 'file', fileType: 'pdf', src: blobUrl(node) }
  return node.blobKey ? null : { ...base, type: 'file', fileType: 'text' }
}

/**
 * Converts a directory into the tree the Win95 folder window renders.
 * Photos only lists images; the desktop also lists text files and PDFs.
 */
const buildFileEntries = (
  dir: VfsNode,
  dirPath: string,
  options: { allFiles?: boolean; skip?: (node: VfsNode) => boolean } = {},
): FileEntry[] => {
  const entries: FileEntry[] = []
  listChildren(dir.id).forEach((node) => {
    if (options.skip?.(node)) return
    const path = `${dirPath}\\${node.name}`
    if (node.type === 'dir') {
      const content = buildFileEntries(node, path, { allFiles: options.allFiles })
      entries.push({
        id: node.id,
        title: node.name,
        type: 'folder',
        altText: node.name,
        size: content.reduce((sum, e) => sum + e.size, 0),
        path,
        content,
      })
      return
    }
    const entry = toFileEntry(node, path, Boolean(options.allFiles))
    if (entry) entries.push(entry)
  })
  return entries
}

const buildPhotos = (home: VfsNode) => {
  const dir = childOf(home, CONTENT_DIRS.photos)
  const folders = dir ? buildFileEntries(dir, `${CONTENT_HOME_PATH}\\${dir.name}`) : []
  return { folderSize: folders.reduce((sum, e) => sum + e.size, 0), folders }
}

const DESKTOP_KIND_ORDER = { folder: 0, file: 1, photo: 1 } as const

const buildDesktopEntries = (home: VfsNode): FileEntry[] => {
  const dir = childOf(home, CONTENT_DIRS.desktop)
  if (!dir) return []
  return buildFileEntries(dir, `${CONTENT_HOME_PATH}\\${dir.name}`, {
    allFiles: true,
    skip: (node) => node.type === 'file' && fileExtension(node.name) === 'LNK',
  }).sort(
    (a, b) =>
      DESKTOP_KIND_ORDER[a.type] - DESKTOP_KIND_ORDER[b.type] ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  )
}

const buildSocial = (home: VfsNode, warn: Warn) =>
  visibleFiles(childOf(home, CONTENT_DIRS.social), 'URL')
    .map((file) => {
      const sections = parseIni(file.content || '')
      const link = iniSection(sections, 'InternetShortcut')
      const menu = iniSection(sections, 'Menu')
      if (!link.url) {
        warn(`SOCIAL\\${file.name}`, 'missing [InternetShortcut] URL=, skipped')
        return null
      }
      const label = baseName(file.name)
      return {
        id: file.name,
        label,
        url: link.url,
        icon: link.iconfile || '',
        accessKey: menu.accesskey || label.charAt(0),
        order: toInt(menu.order, Number.MAX_SAFE_INTEGER),
      }
    })
    .filter((s) => s !== null)
    .sort((a, b) => a.order - b.order)

const buildDesktop = (home: VfsNode, warn: Warn) =>
  visibleFiles(childOf(home, CONTENT_DIRS.desktop), 'LNK')
    .map((file) => {
      const s = iniSection(parseIni(file.content || ''), 'Shortcut')
      if (!s.target) {
        warn(`DESKTOP\\${file.name}`, 'missing [Shortcut] Target=, skipped')
        return null
      }
      return {
        id: file.name,
        target: s.target,
        name: s.name || baseName(file.name),
        icon: s.icon || '',
        order: toInt(s.order, Number.MAX_SAFE_INTEGER),
        x: s.x || '',
        y: s.y || '',
      }
    })
    .filter((s) => s !== null)
    .sort((a, b) => a.order - b.order)

export type SiteContent = ReturnType<typeof buildSiteContent>

/**
 * Reads `C:\MBURAKBILGIC` and converts its files into the shapes the Vue
 * components consume. Malformed files are skipped (and logged) so a typo
 * typed in the DOS shell can never take the whole site down.
 *
 * @param {{ onWarning?: (path: string, message: string) => void }} [options]
 *   Receives skipped-file warnings (path relative to C:\MBURAKBILGIC);
 *   defaults to logging them.
 * @returns {{ site: object, bio: object, projects: object[], techMonolith: object, photos: object, social: object[], desktop: object[], desktopEntries: object[] }}
 *   `desktop` holds the `.LNK` shortcuts; `desktopEntries` the other
 *   folders and files under DESKTOP, in the folder-window tree shape.
 * @throws {Error} When the content tree has not been seeded.
 * @example
 *   const { bio, projects } = buildSiteContent()
 */
export const buildSiteContent = (options: { onWarning?: Warn } = {}) => {
  const home = findChild(getRootNode().id, CONTENT_HOME_DIR)
  if (!home) throw new Error(`${CONTENT_HOME_PATH} does not exist`)
  const warn: Warn = options.onWarning || ((path, message) => console.warn(`[content] ${path}: ${message}`))

  return {
    site: buildSite(home),
    bio: buildBio(home, warn),
    projects: buildProjects(home, warn),
    techMonolith: buildTechMonolith(home),
    photos: buildPhotos(home),
    social: buildSocial(home, warn),
    desktop: buildDesktop(home, warn),
    desktopEntries: buildDesktopEntries(home),
  }
}

const siteContentSnapshot = (): string => {
  try {
    return JSON.stringify(buildSiteContent({ onWarning: () => {} }))
  } catch {
    return ''
  }
}

/**
 * Runs a VFS write and reports whether it changed what `GET /api/content`
 * returns, i.e. whether a page refresh will show it. Comparing the built
 * content (instead of matching paths) stays correct for every file format,
 * the hidden attribute and asset references resolved from other folders.
 *
 * @param {() => T} write Must run inside the caller's transaction.
 * @returns {T & { siteChanged: boolean }}
 * @example
 *   return useDb().transaction(() => trackSiteChange(() => handler({ event, body })))()
 */
export const trackSiteChange = <T extends object>(write: () => T): T & { siteChanged: boolean } => {
  const before = siteContentSnapshot()
  const result = write()
  return { ...result, siteChanged: siteContentSnapshot() !== before }
}

const PROTECTED_PATHS = new Set(
  [
    `${VFS_DRIVE}\\`,
    CONTENT_HOME_PATH,
    ...Object.values(CONTENT_DIRS)
      .filter((dir) => dir !== CONTENT_DIRS.jobs)
      .map((dir) => `${CONTENT_HOME_PATH}\\${dir}`),
    `${CONTENT_HOME_PATH}\\${CONTENT_DIRS.bio}\\${CONTENT_DIRS.jobs}`,
    ...MAIL_PROTECTED_PATHS,
  ].map((path) => path.toUpperCase()),
)

/**
 * Whether a canonical path is one of the directories the site builder
 * or the mailbox depends on; those cannot be deleted, renamed, moved or
 * hidden (and `C:\MAIL` cannot be un-hidden, see the attrib endpoint).
 *
 * @param {string} canonicalPath As returned by `vfsNodePath`.
 * @returns {boolean}
 * @example
 *   isProtectedPath('C:\\MBURAKBILGIC\\DESKTOP') // → true
 */
export const isProtectedPath = (canonicalPath: string): boolean => PROTECTED_PATHS.has(canonicalPath.toUpperCase())

/**
 * Rebuilds the site content and returns the warnings for files at or
 * below the given paths, so a DOS write can tell the admin that the file
 * they just touched will be skipped by the site.
 *
 * @param {string[]} canonicalPaths Paths touched by the write.
 * @returns {string[]} e.g. `['PROJECTS\\x.INI: missing [Project] Title=, skipped']`
 * @example
 *   const warnings = collectContentWarnings([vfsNodePath(file)])
 */
export const collectContentWarnings = (canonicalPaths: string[]): string[] => {
  const prefix = `${CONTENT_HOME_PATH}\\`.toUpperCase()
  const touched = canonicalPaths.map((p) => p.toUpperCase())
  const warnings: string[] = []
  try {
    buildSiteContent({
      onWarning: (path, message) => {
        const absolute = `${prefix}${path.toUpperCase()}`
        if (touched.some((t) => absolute === t || absolute.startsWith(`${t}\\`))) {
          warnings.push(`${path}: ${message}`)
        }
      },
    })
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error))
  }
  return [...warnings, ...collectSpamRulesWarnings(canonicalPaths)]
}
