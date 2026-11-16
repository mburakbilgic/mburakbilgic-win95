import windows from '@/content/windows.json'
import mail from '@/content/mail.json'
import { useContentStore } from '@/stores/content'

/**
 * Single entry point that returns all user-facing site content.
 * Editable content comes from the content store, which `app.vue` fills
 * from `GET /api/content` (the SQLite file tree) before any window
 * renders; app-level JSON (window registry, mail UI text) is bundled.
 *
 * The returned objects are the store's reactive state at call time, so
 * components that destructure them must not outlive a `setContent` call
 * that replaces a whole section.
 *
 * @returns {{
 *   site: object,
 *   bio: object,
 *   social: object[],
 *   techMonolith: object,
 *   projects: object[],
 *   photos: { folderSize: number, folders: Array<object> },
 *   desktop: object[],
 *   windows: typeof windows,
 *   mail: typeof mail,
 * }}
 * @example
 *   const { site, bio } = useContent()
 */
export const useContent = () => {
  const store = useContentStore()
  return {
    site: store.site,
    bio: store.bio,
    social: store.social,
    techMonolith: store.techMonolith,
    projects: store.projects,
    photos: store.photos,
    desktop: store.desktop,
    windows,
    mail,
  }
}
