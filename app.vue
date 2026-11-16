<script setup>
import FileWindow from './templates/FileWindow.vue'
import Window from './templates/Window.vue'
import Mail from './templates/Mail.vue'
import Navbar from './templates/Navbar.vue'
import AppGrid from './templates/AppGrid.vue'
import Bio from './views/Bio.vue'
import Resume from './views/Resume.vue'
import TechMonolith from './views/TechMonolith.vue'
import ImagePreviewWindow from './templates/ImagePreviewWindow.vue'
import StartMenu from './templates/StartMenu.vue'
import Projects from './views/Projects.vue'
import DosReadme from './views/DosReadme.vue'
import DosPrompt from './views/DosPrompt.vue'
import Notepad from './views/Notepad.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import {
    useWindowsStore
} from '@/stores/windows'
import { useContentStore } from '@/stores/content'

const contentStore = useContentStore()
if (!contentStore.loaded) {
  const { data, error } = await useFetch('/api/content')
  if (error.value || !data.value) {
    throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
  }
  contentStore.setContent(data.value)
}

const windowsStore = useWindowsStore()
const windows = windowsStore.windows

const windowComponents = [
  { name: 'window', comp: Window },
  { name: 'ImagePreviewWindow', comp: ImagePreviewWindow },
  { name: 'mail', comp: Mail },
  { name: 'FilesWindow', comp: FileWindow }
]

const slotViews = [
  { name: 'bio', comp: Bio },
  { name: 'resume', comp: Resume },
  { name: 'techmonolith', comp: TechMonolith },
  { name: 'projects', comp: Projects },
  { name: 'dosReadme', comp: DosReadme },
  { name: 'dosPrompt', comp: DosPrompt },
  { name: 'notepad', comp: Notepad },
]

const windowCheck = (windowId) => {
    const win = windowsStore.getWindowById(windowId)
    return win ? win.windowState === "open" : false
}

const deinitWindows = () => {
  if (windowsStore.activeWindow == "Menu") {
    windowsStore.setActiveWindow("")
    windowsStore.zIndexIncrement("")
  }
}

const openWindow = (windowId) => {
  const payload = {
    windowState: "open",
    windowId: windowId
  }
  windowsStore.setWindowState(payload)
}

const onResize = () => {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty("--vh", `${vh}px`)
}

onMounted(() => {
  const navbar = document.getElementById("navbar")
  const screen = document.getElementById("screen")
  if (navbar && screen) {
    screen.style.height = window.innerHeight - navbar.clientHeight + "px"
  }

  window.addEventListener("resize", onResize)
  openWindow('BiographyWindow')
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize)
})

</script>

<template>
  <div id="app">
    <div class="screen" id="screen" @click="deinitWindows">
      <div
        v-for="window in windows"
        :key="window.windowId"
        :aria-label="window.displayName"
      >
          <component
            :is="(windowComponents.find(comp => comp.name === window.windowComponent) || {}).comp"
            :nameOfWindow="window.windowId"
            :contentPaddingBottom="window.windowContentPadding['bottom']"
            :contentPaddingLeft="window.windowContentPadding['left']"
            :contentPaddingRight="window.windowContentPadding['right']"
            :contentPaddingTop="window.windowContentPadding['top']"
            :id="window.windowId" 
            :style="{
                    position: window.position,
                    left: window.positionX,
                    top: window.positionY,
                  }" 
            :folderContent="window.folderContent" 
            :folderSize="window.folderSize" 
            v-if="windowCheck(window.windowId)" 
          >
          <template v-slot:content>
            <component :is="(slotViews.find(comp => comp.name === window.windowContent) || {}).comp"></component>
          </template>
          </component>
        </div>
        <AppGrid />
    </div>
    <StartMenu
      v-if="windowsStore.activeWindow == 'Menu'"
      style="position: absolute; z-index: 9999; left: 0; bottom: 36px"
    ></StartMenu>
    <navbar style="position: absolute; bottom: 0; z-index: 9999" id="navbar" />
  </div>
</template>

<style>

@import "./assets/css/utils/normalize.css";
@import "./assets/css/windows/app.css";
@import "./assets/css/windows/window.css";
@import "./assets/css/windows/appgrid.css";

@font-face {
  font-family: "MS Sans Serif";
  src: url("@/assets/fonts/MS-Sans-Serif.ttf");
}

/*-------------------------------------------*\
    Utilities
\*-------------------------------------------*/

html {
  overflow: hidden;
}

h6 {
    margin-top: 5px !important;
}

#app {
  font-family: "MS Sans Serif";
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  display: flex;
  width: 100%;
  height: calc(var(--vh, 1vh) * 100);
  flex-direction: column;
}

.screen {
  width: 100%;
  position: relative;
  z-index: 999;
}

::-webkit-scrollbar {
  width: 15px;
  background: repeating-conic-gradient(
      rgb(189, 190, 189) 0% 25%,
      rgb(255, 255, 255) 0% 50%
    )
    50% / 2px 2px;
}
::-webkit-scrollbar-thumb {
  background: rgb(189, 190, 189);
  border-top: solid rgb(250, 250, 250) 1.5px;
  border-left: solid rgb(250, 250, 250) 1.5px;
  border-bottom: solid rgb(90, 90, 90) 1.5px;
  border-right: solid rgb(90, 90, 90) 1.5px;
  outline: rgb(219, 219, 219);
}

/*-------------------------------------------*\
    Fullscreen
\*-------------------------------------------*/

.fullscreen {
  left: 0 !important;
  position: relative;
  display: block;
  top: 0 !important;
  right: 0 !important;
}
</style>
