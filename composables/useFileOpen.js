import { useWindowsStore } from '@/stores/windows'
import notepad from '@/content/notepad.json'
import {
  FOLDER_WINDOW_PREFIX,
  NOTEPAD_WINDOW_PREFIX,
  OPENED_WINDOW_MAX_OFFSET_VH,
  OPENED_WINDOW_MAX_OFFSET_VW,
} from '@/constants/ui'

const IMAGE_PREVIEW_WINDOW_ID = 'ImagePreviewWindow'
const NO_PADDING = { top: '0px', right: '0px', bottom: '0px', left: '0px' }

const randomOffset = (max) => `${Math.floor(Math.random() * max) + 1}`

const baseWindow = (windowId, overrides) => ({
  windowId,
  windowState: 'close',
  windowContent: '',
  windowContentPadding: NO_PADDING,
  position: 'absolute',
  positionX: `${randomOffset(OPENED_WINDOW_MAX_OFFSET_VW)}vw`,
  positionY: `${randomOffset(OPENED_WINDOW_MAX_OFFSET_VH)}vh`,
  fullscreen: false,
  showInNavbar: true,
  ...overrides,
})

/**
 * Opens a virtual file system entry the way Explorer does: folders in a
 * folder window, images in the media viewer, PDFs in a new browser tab
 * and text files in Notepad. Folder and Notepad windows are keyed by the
 * node id, so opening the same entry again brings its window back.
 *
 * @returns {{ openEntry: (entry: object, siblings?: object[]) => void }}
 * @example
 *   const { openEntry } = useFileOpen()
 *   openEntry(entry, desktopEntries) // siblings feed the image viewer's next/previous
 */
export const useFileOpen = () => {
  const windowsStore = useWindowsStore()

  const openWindow = (windowId, create) => {
    if (!windowsStore.getWindowById(windowId)) windowsStore.pushNewWindow(create())
    windowsStore.setWindowState({ windowState: 'open', windowId })
  }

  const openImage = (entry, siblings) => {
    const photos = siblings.filter((e) => e.type === 'photo')
    const index = Math.max(0, photos.indexOf(entry))
    windowsStore.setWindowState({ windowState: 'close', windowId: IMAGE_PREVIEW_WINDOW_ID })
    windowsStore.setPhotoFolderContent([...photos.slice(index), ...photos.slice(0, index)])
    windowsStore.setWindowState({ windowState: 'open', windowId: IMAGE_PREVIEW_WINDOW_ID })
  }

  const openEntry = (entry, siblings = [entry]) => {
    if (entry.type === 'folder') {
      openWindow(`${FOLDER_WINDOW_PREFIX}${entry.id}`, () =>
        baseWindow(`${FOLDER_WINDOW_PREFIX}${entry.id}`, {
          displayName: entry.title,
          windowComponent: 'FilesWindow',
          iconImage: 'folder.png',
          altText: entry.title,
          folderContent: entry.content,
          folderSize: entry.size,
        }),
      )
    } else if (entry.type === 'photo') {
      openImage(entry, siblings)
    } else if (entry.fileType === 'pdf') {
      window.open(entry.src, '_blank', 'noopener')
    } else if (entry.fileType === 'text') {
      openWindow(`${NOTEPAD_WINDOW_PREFIX}${entry.id}`, () =>
        baseWindow(`${NOTEPAD_WINDOW_PREFIX}${entry.id}`, {
          displayName: `${entry.title}${notepad.titleSuffix}`,
          windowComponent: 'window',
          windowContent: 'notepad',
          iconImage: 'file.png',
          altText: entry.title,
          filePath: entry.path,
          fileName: entry.title,
        }),
      )
    }
  }

  return { openEntry }
}
