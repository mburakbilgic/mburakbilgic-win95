import { defineStore } from "pinia";
import { nextTick } from "vue";
import windowsConfig from "@/content/windows.json";
import notepad from "@/content/notepad.json";
import { useContentStore } from "@/stores/content";
import { FOLDER_WINDOW_PREFIX, NOTEPAD_WINDOW_PREFIX } from "@/constants/ui";

const findEntry = (entries, id) => {
  for (const entry of entries) {
    if (entry.id === id) return entry;
    const nested = entry.content ? findEntry(entry.content, id) : null;
    if (nested) return nested;
  }
  return null;
};

const openedEntryId = (windowId) => {
  const prefix = [FOLDER_WINDOW_PREFIX, NOTEPAD_WINDOW_PREFIX].find((p) => windowId.startsWith(p));
  return prefix ? Number(windowId.slice(prefix.length)) : null;
};

/**
 * Builds the window records from the bundled registry, applying the
 * desktop shortcut (`C:\MBURAKBILGIC\DESKTOP\*.LNK`) that targets each
 * window as an override for its name, icon and opening position, and
 * injecting the photo tree into windows flagged with `photoFolder`.
 *
 * @param {Array<object>} configs `content/windows.json`
 * @param {{ desktop: Array<object>, photos: { folders: Array<object>, folderSize: number } }} content
 * @returns {Array<object>}
 */
const hydrateWindows = (configs, content) =>
  configs.map((config) => {
    const { photoFolder, ...w } = config;
    const shortcut = content.desktop.find((s) => s.target === w.windowId);
    const hydrated = shortcut
      ? {
          ...w,
          displayName: shortcut.name || w.displayName,
          altText: shortcut.name || w.altText,
          iconImage: shortcut.icon || w.iconImage,
          positionX: shortcut.x || w.positionX,
          positionY: shortcut.y || w.positionY,
        }
      : w;
    if (!photoFolder) return hydrated;
    return {
      ...hydrated,
      folderContent: content.photos.folders,
      folderSize: content.photos.folderSize,
    };
  });

export const useWindowsStore = defineStore("windows", {
  state: () => ({
    activeWindow: "",
    activeWindows: [],
    zIndex: 2,
    photoFolderContent: [],
    windows: hydrateWindows(windowsConfig, useContentStore()),
  }),

  getters: {
    /**
     * Returns the current viewport height in pixels for fullscreen
     * windows. Falls back to "0px" during SSR when no DOM is available.
     * @returns {string}
     */
    getFullscreenWindowHeight() {
      if (typeof window === "undefined") return "0px";
      return window.innerHeight + "px";
    },
  },

  actions: {
    /**
     * Returns the window record matching the given windowId.
     * @param {string} windowId
     * @returns {object|undefined}
     */
    getWindowById(windowId) {
      return this.windows.find((w) => w.windowId === windowId);
    },

    /**
     * Returns whether the window is currently in fullscreen mode.
     * @param {string} windowId
     * @returns {boolean}
     */
    getWindowFullscreen(windowId) {
      const w = this.getWindowById(windowId);
      return w ? w.fullscreen : false;
    },

    /**
     * Returns the windowId of the window currently marked active.
     * @returns {string}
     */
    getActiveWindow() {
      return this.activeWindow;
    },

    /**
     * Marks the given windowId as the active window.
     * @param {string} windowId
     */
    setActiveWindow(windowId) {
      this.activeWindow = windowId;
    },

    /**
     * Updates the fullscreen state of a window.
     * @param {{ fullscreen: boolean, windowId: string }} payload
     */
    setFullscreen(payload) {
      const w = this.getWindowById(payload.windowId);
      if (w) w.fullscreen = payload.fullscreen;
    },

    /**
     * Increments the z-index counter and updates the matching DOM
     * element's z-index. Silently skips when the element has not yet
     * been rendered.
     * @param {string} windowId
     */
    zIndexIncrement(windowId) {
      this.zIndex++;
      if (typeof document === "undefined") return;
      const el = document.getElementById(windowId);
      if (el) el.style.zIndex = this.zIndex;
    },

    /**
     * Appends a window record to the activeWindows list so the
     * navbar knows it is open/minimized.
     * @param {object} window
     */
    pushActiveWindow(window) {
      this.activeWindows.push(window);
    },

    /**
     * Removes a window record from the activeWindows list. No-op
     * when the record is not present.
     * @param {object} window
     */
    popActiveWindow(window) {
      const idx = this.activeWindows.indexOf(window);
      if (idx !== -1) this.activeWindows.splice(idx, 1);
    },

    /**
     * Registers a new window record in the store. Used when opening
     * dynamic windows (e.g. per-project DOS readme or subfolder).
     * @param {object} window
     */
    pushNewWindow(window) {
      this.windows.push(window);
    },

    /**
     * Applies freshly loaded content to the existing window records
     * without touching their open/closed state: shortcut name and icon
     * overrides, the Photos tree, and the folder and Notepad windows
     * opened from VFS entries. A window whose entry no longer exists
     * (deleted, hidden) is closed. Open windows keep their position.
     *
     * @param {{ desktop: object[], desktopEntries: object[], photos: { folders: object[], folderSize: number } }} content
     * @returns {void}
     * @example
     *   windowsStore.rehydrate(useContentStore())
     */
    rehydrate(content) {
      hydrateWindows(windowsConfig, content).forEach((fresh) => {
        const record = this.getWindowById(fresh.windowId);
        if (!record) return;
        Object.assign(record, {
          displayName: fresh.displayName,
          altText: fresh.altText,
          iconImage: fresh.iconImage,
        });
        if (record.windowState === "close") {
          Object.assign(record, { positionX: fresh.positionX, positionY: fresh.positionY });
        }
        if (fresh.folderContent) {
          Object.assign(record, { folderContent: fresh.folderContent, folderSize: fresh.folderSize });
        }
      });

      const entries = [...content.desktopEntries, ...content.photos.folders];
      this.windows.forEach((record) => {
        const id = openedEntryId(record.windowId);
        if (id === null) return;
        const entry = findEntry(entries, id);
        if (!entry) {
          if (record.windowState !== "close") this.setWindowState({ windowState: "close", windowId: record.windowId });
          return;
        }
        if (record.windowId.startsWith(FOLDER_WINDOW_PREFIX)) {
          Object.assign(record, {
            displayName: entry.title,
            altText: entry.title,
            folderContent: entry.content,
            folderSize: entry.size,
          });
        } else {
          Object.assign(record, {
            displayName: `${entry.title}${notepad.titleSuffix}`,
            altText: entry.title,
            fileName: entry.title,
            filePath: entry.path,
          });
        }
      });
    },

    /**
     * Replaces the payload shown by the shared image preview window
     * (gallery navigation snapshot).
     * @param {Array<object>} payload
     */
    setPhotoFolderContent(payload) {
      this.photoFolderContent = payload;
    },

    /**
     * Changes a window's state (open/close/minimize) and keeps
     * active window / z-index / activeWindows list in sync. DOM-touching
     * side effects (z-index update) are deferred to the next render
     * tick via nextTick, because the windowState change does not
     * update the DOM synchronously.
     *
     * @param {{ windowState: 'open'|'close'|'minimize', windowId: string }} payload
     * @returns {void}
     * @throws {Error} When an unknown windowState is provided.
     */
    setWindowState(payload) {
      const window = this.getWindowById(payload.windowId);
      if (!window) {
        throw new Error(`setWindowState: windowId not found: ${payload.windowId}`);
      }

      const wasVisible = window.windowState === "open" || window.windowState === "minimize";

      if (payload.windowState === "open") {
        window.windowState = "open";
        if (!wasVisible) {
          this.pushActiveWindow(window);
        }
        nextTick(() => {
          this.zIndexIncrement(payload.windowId);
          this.setActiveWindow(payload.windowId);
        });
      } else if (payload.windowState === "close") {
        window.windowState = "close";
        this.popActiveWindow(window);
        this.setActiveWindow("nil");
      } else if (payload.windowState === "minimize") {
        window.windowState = "minimize";
        this.setActiveWindow("nil");
      } else {
        throw new Error(`setWindowState: invalid windowState: ${payload.windowState}`);
      }
    },
  },
});
