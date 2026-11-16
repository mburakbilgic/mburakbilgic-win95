import { useContentStore } from '@/stores/content'
import { useWindowsStore } from '@/stores/windows'

/**
 * Reloads `GET /api/content` and applies it in place: the content store
 * keeps its object references (so components that destructured
 * `useContent()` see the change) and the window records pick up renamed
 * shortcuts, changed folders and moved or deleted files.
 *
 * @returns {() => Promise<boolean>} Resolves false when the reload failed
 *   (the caller then falls back to asking for a page refresh).
 * @example
 *   const refreshContent = useContentRefresh()
 *   if (!(await refreshContent())) showRefreshHint()
 */
export const useContentRefresh = () => {
  const contentStore = useContentStore()
  const windowsStore = useWindowsStore()
  return async () => {
    try {
      contentStore.setContent(await $fetch('/api/content'))
      windowsStore.rehydrate(contentStore)
      return true
    } catch (error) {
      if (import.meta.dev) console.log('[content] refresh failed', error)
      return false
    }
  }
}
