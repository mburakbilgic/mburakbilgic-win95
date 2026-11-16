import { defineStore } from 'pinia'

const CONTENT_KEYS = ['site', 'bio', 'projects', 'techMonolith', 'photos', 'social', 'desktop']

export const useContentStore = defineStore('content', {
  state: () => ({
    loaded: false,
    site: {},
    bio: { techBadges: [], aboutParagraphs: [], employment: [] },
    projects: [],
    techMonolith: { phases: [] },
    photos: { folderSize: 0, folders: [] },
    social: [],
    desktop: [],
  }),

  actions: {
    /**
     * Stores the site content tree returned by `GET /api/content`.
     *
     * @param {{ site: object, bio: object, projects: object[], techMonolith: object, photos: object, social: object[], desktop: object[] }} payload
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
        this[key] = payload[key]
      })
      this.loaded = true
    },
  },
})
