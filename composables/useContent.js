import site from '@/content/site.json'
import bio from '@/content/bio.json'
import social from '@/content/social.json'
import techMonolith from '@/content/tech-monolith.json'
import projects from '@/content/projects.json'
import photos from '@/content/photos.json'
import windows from '@/content/windows.json'
import mail from '@/content/mail.json'

/**
 * Builds the folder tree by looking up the env key stored in each
 * `srcEnv` field of `content/photos.json` against
 * `useRuntimeConfig().public.photoUrls`. Falls back to an empty string
 * when a URL is not defined, so the component can silently skip that
 * image.
 *
 * @param {Record<string,string>} photoUrls
 * @returns {Array<{ id:number, title:string, type:'folder', altText:string, size:number, content:Array<object> }>}
 */
const resolvePhotoFolders = (photoUrls) => {
  return photos.folders.map((folder) => ({
    ...folder,
    content: folder.content.map((item) => ({
      ...item,
      src: item.srcEnv ? (photoUrls[item.srcEnv] || '') : '',
    })),
  }))
}

/**
 * Single entry point that returns all user-facing site content.
 * The composable is auto-imported by Nuxt, so it can be called from
 * any `<script setup>` block.
 *
 * @returns {{
 *   site: typeof site,
 *   bio: typeof bio,
 *   social: typeof social,
 *   techMonolith: typeof techMonolith,
 *   projects: typeof projects,
 *   windows: typeof windows,
 *   mail: typeof mail,
 *   photos: { folderSize: number, folders: Array<object> }
 * }}
 */
export const useContent = () => {
  const photoUrls = useRuntimeConfig().public.photoUrls || {}
  return {
    site,
    bio,
    social,
    techMonolith,
    projects,
    windows,
    mail,
    photos: {
      folderSize: photos.folderSize,
      folders: resolvePhotoFolders(photoUrls),
    },
  }
}
