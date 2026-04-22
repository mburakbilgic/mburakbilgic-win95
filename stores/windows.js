import { defineStore } from "pinia";
import { nextTick } from "vue";
import windowsConfig from "@/content/windows.json";
import photos from "@/content/photos.json";

/**
 * Resolves the `srcEnv` references in `content/photos.json` against the
 * given URL map (runtime config) to produce a folder tree ready for the
 * store state.
 *
 * @param {Record<string,string>} photoUrls
 * @returns {Array<object>}
 */
const resolvePhotoFolders = (photoUrls) =>
  photos.folders.map((folder) => ({
    ...folder,
    content: folder.content.map((item) => ({
      ...item,
      src: item.srcEnv ? (photoUrls[item.srcEnv] || "") : "",
    })),
  }));

/**
 * When a window record is flagged with `photoFolder`, injects the
 * `photos.json` contents as `folderContent` and `folderSize` fields.
 *
 * @param {Array<object>} configs
 * @param {Record<string,string>} photoUrls
 * @returns {Array<object>}
 */
const hydrateWindows = (configs, photoUrls) =>
  configs.map((w) => {
    if (!w.photoFolder) return w;
    const { photoFolder, ...rest } = w;
    return {
      ...rest,
      folderContent: resolvePhotoFolders(photoUrls),
      folderSize: photos.folderSize,
    };
  });

export const useWindowsStore = defineStore("windows", {
  state: () => ({
    activeWindow: "",
    activeWindows: [],
    zIndex: 2,
    photoFolderContent: [],
    windows: hydrateWindows(
      windowsConfig,
      useRuntimeConfig().public.photoUrls || {},
    ),
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
