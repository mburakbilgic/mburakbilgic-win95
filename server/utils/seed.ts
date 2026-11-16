import siteSeed from '@/server/seed/site.json'
import bioSeed from '@/server/seed/bio.json'
import projectsSeed from '@/server/seed/projects.json'
import socialSeed from '@/server/seed/social.json'
import techMonolithSeed from '@/server/seed/tech-monolith.json'
import photosSeed from '@/server/seed/photos.json'
import desktopSeed from '@/server/seed/desktop.json'
import windowsConfig from '@/content/windows.json'

const SHORTCUT_NAME_TRAILING_DOTS = /\.+$/

const writeDir = (parentId: number, name: string, sortOrder = 0) =>
  createNode(parentId, { name, type: 'dir', sortOrder })

const writeFile = (parentId: number, name: string, content: string, extra: { size?: number; sortOrder?: number } = {}) =>
  createNode(parentId, { name, type: 'file', content, ...extra })

const seedSite = (homeId: number) => {
  writeFile(homeId, CONTENT_FILES.site, stringifyIni([{
    name: 'Site',
    entries: {
      Name: siteSeed.name,
      Headline: siteSeed.headline,
      Location: siteSeed.location,
      BirthYear: siteSeed.birthYear,
      Domain: siteSeed.domain,
      MailRecipientLabel: siteSeed.mailRecipientLabel,
      AvatarPath: siteSeed.avatarPath,
      ProjectsAddressBar: siteSeed.projectsAddressBar,
    },
  }]))
}

const seedDesktop = (homeId: number) => {
  const desktop = writeDir(homeId, CONTENT_DIRS.desktop)
  desktopSeed
    .map((windowId) => {
      const config = windowsConfig.find((w) => w.windowId === windowId)
      if (!config) throw new Error(`[seed] desktop.json references unknown window: ${windowId}`)
      return config
    })
    .forEach((w, index) => {
      writeFile(desktop.id, `${w.displayName.replace(SHORTCUT_NAME_TRAILING_DOTS, '')}.LNK`, stringifyIni([{
        name: 'Shortcut',
        entries: {
          Target: w.windowId,
          Name: w.displayName,
          Icon: w.iconImage,
          Order: index + 1,
          X: w.positionX,
          Y: w.positionY,
        },
      }]), { sortOrder: index })
    })
}

const seedBio = (homeId: number) => {
  const bioDir = writeDir(homeId, CONTENT_DIRS.bio)
  writeFile(bioDir.id, CONTENT_FILES.about, stringifyHeaderDoc(
    {
      Intro: bioSeed.aboutIntroTemplate,
      ResumeLabel: bioSeed.resumeLinkLabel,
      ResumePath: bioSeed.resumeLocalPath,
    },
    bioSeed.aboutParagraphs.map((p) => p.text).join('\n\n'),
  ))
  writeFile(bioDir.id, CONTENT_FILES.badges, stringifyIni(
    bioSeed.techBadges.map((b) => ({ name: b.alt, entries: { Src: b.src } })),
  ))
  const jobsDir = writeDir(bioDir.id, CONTENT_DIRS.jobs)
  bioSeed.employment.forEach((job, index) => {
    const prefix = String(index + 1).padStart(2, '0')
    writeFile(jobsDir.id, `${prefix} ${job.company}.TXT`, stringifyHeaderDoc(
      { Company: job.company, Period: job.period, Role: job.role },
      job.description,
    ))
  })
}

const seedProjects = (homeId: number) => {
  const dir = writeDir(homeId, CONTENT_DIRS.projects)
  projectsSeed.forEach((p, index) => {
    writeFile(dir.id, `${p.id}.INI`, stringifyIni([{
      name: 'Project',
      entries: { Title: p.title, Owner: p.owner, Repo: p.repo, Branch: p.branch, Description: p.description },
    }]), { sortOrder: index })
  })
}

const seedTechMonolith = (homeId: number) => {
  const dir = writeDir(homeId, CONTENT_DIRS.techMonolith)
  writeFile(dir.id, CONTENT_FILES.techMonolith, stringifyIni([{
    name: 'TechMonolith',
    entries: {
      LogoUrl: techMonolithSeed.logoUrl,
      LogoAlt: techMonolithSeed.logoAlt,
      CompanyUrl: techMonolithSeed.companyUrl,
      CompanyLabel: techMonolithSeed.companyLabel,
    },
  }]), { sortOrder: -1 })
  techMonolithSeed.phases.forEach((phase, index) => {
    const image = 'image' in phase ? phase.image : undefined
    writeFile(dir.id, `PHASE${index + 1}.TXT`, stringifyHeaderDoc(
      {
        Title: phase.title,
        Image: image?.url,
        Caption: image?.caption,
        Variant: image?.variant,
      },
      phase.paragraphs.map((p) => p.text).join('\n\n'),
    ))
  })
}

const seedPhotos = (homeId: number) => {
  const dir = writeDir(homeId, CONTENT_DIRS.photos)
  photosSeed.folders.forEach((folder, folderIndex) => {
    const folderNode = writeDir(dir.id, folder.title, folderIndex)
    folder.content.forEach((item, itemIndex) => {
      const url = (item.srcEnv && process.env[item.srcEnv]) || ''
      if (!url) console.warn(`[seed] ${item.srcEnv} is empty; ${folder.title}\\${item.title} will be skipped until a URL is written to it.`)
      writeFile(folderNode.id, item.title, url, { size: item.size, sortOrder: itemIndex })
    })
  })
}

const seedSocial = (homeId: number) => {
  const dir = writeDir(homeId, CONTENT_DIRS.social)
  socialSeed.forEach((link, index) => {
    writeFile(dir.id, `${link.label}.URL`, stringifyIni([
      { name: 'InternetShortcut', entries: { URL: link.url, IconFile: link.icon } },
      { name: 'Menu', entries: { AccessKey: link.accessKey, Order: index + 1 } },
    ]), { sortOrder: index })
  })
}

/**
 * Populates an empty database with the site's initial content tree from
 * `server/seed/*.json` and `content/windows.json`. Photo URLs are read
 * once from the legacy `NUXT_PUBLIC_PHOTOS_*` env vars. Does nothing when
 * `C:\MBURAKBILGIC` already exists, so it never overwrites admin edits.
 *
 * @returns {boolean} `true` when the tree was created.
 * @throws {VfsError} When the seed data contains an invalid name.
 * @example
 *   if (seedContentTree()) console.info('[seed] content tree created')
 */
export const seedContentTree = (): boolean => {
  const root = getRootNode()
  if (findChild(root.id, CONTENT_HOME_DIR)) return false

  useDb().transaction(() => {
    const home = writeDir(root.id, CONTENT_HOME_DIR)
    seedSite(home.id)
    seedDesktop(home.id)
    seedBio(home.id)
    seedProjects(home.id)
    seedTechMonolith(home.id)
    seedPhotos(home.id)
    seedSocial(home.id)
  })()
  return true
}
