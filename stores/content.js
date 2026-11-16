import { defineStore } from 'pinia'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Copies `source` into `target` without replacing the target object, so
 * components holding a reference to a section keep seeing current data.
 */
const replaceInPlace = (target, source) => {
  if (Array.isArray(target) && Array.isArray(source)) {
    target.splice(0, target.length, ...source)
    return target
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    Object.keys(target).forEach((key) => {
      if (!(key in source)) delete target[key]
    })
    return Object.assign(target, source)
  }
  return source
}

const CONTENT_KEYS = ['site', 'bio', 'projects', 'techMonolith', 'photos', 'social', 'desktop', 'desktopEntries']

export const useContentStore = defineStore('content', {
  state: () => ({
    loaded: false,
    version: 0,
    site: {},
    bio: { techBadges: [], aboutParagraphs: [], employment: [] },
    projects: [],
    techMonolith: { phases: [] },
    photos: { folderSize: 0, folders: [] },
    social: [],
    desktop: [],
    desktopEntries: [],
  }),

  actions: {
    /**
     * Stores the site content tree returned by `GET /api/content`. Later
     * calls update each section in place and bump `version`, which open
     * windows (e.g. Notepad) watch to reload.
     *
     * @param {{ site: object, bio: object, projects: object[], techMonolith: object, photos: object, social: object[], desktop: object[], desktopEntries: object[] }} payload
     * @returns {void}
     * @throws {Error} When the payload is missing one of the content sections.
     * @example
     *   store.setContent(await $fetch('/api/content'))
     */
    setContent(payload) {
      const missing = CONTENT_KEYS.filter((key) => !payload || payload[key] === undefined)
      if (missing.length) {
        throw new Error(`setContent: missing content sections: ${missing.join(', ')}`)
      }
      CONTENT_KEYS.forEach((key) => {
        this[key] = this.loaded ? replaceInPlace(this[key], payload[key]) : payload[key]
      })
      this.loaded = true
      this.version++
    },
  },
})
