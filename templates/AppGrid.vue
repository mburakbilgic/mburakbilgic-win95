<script setup>
import { computed, onMounted, ref } from 'vue'
import { useWindowsStore } from '@/stores/windows'
import { useImagePath } from '@/composables/useImagePath'
import { useContent } from '@/composables/useContent'
import { useFileOpen } from '@/composables/useFileOpen'
import folderIcon from '@/assets/FileWindow/folder.png'
import fileIcon from '@/assets/FileWindow/file.png'
import imageIcon from '@/assets/FileWindow/image.png'

const NAVBAR_OFFSET_PX = 60
const ENTRY_ICONS = { folder: folderIcon, photo: imageIcon, file: fileIcon }

const windowsStore = useWindowsStore()
const { iconPath } = useImagePath()
const { desktop, desktopEntries } = useContent()
const { openEntry } = useFileOpen()

const shortcuts = computed(() =>
    desktop.filter((shortcut) => windowsStore.getWindowById(shortcut.target))
)

const gridHeight = ref("")

const openWindow = (windowId) => {
    windowsStore.setWindowState({ windowState: "open", windowId })
}

onMounted(() => {
    const gridH = windowsStore.getFullscreenWindowHeight
    const px = parseInt(gridH, 10)
    gridHeight.value = (Number.isFinite(px) ? px - NAVBAR_OFFSET_PX : 0) + "px"
})
</script>

<template>
    <nav class="grid-container" :style="{ height: gridHeight }">
    <li v-for="shortcut in shortcuts" :key="shortcut.id">
      <button
        class="icon"
        @touchstart="openWindow(shortcut.target)"
        @dblclick="openWindow(shortcut.target)"
      >
      <img class="icon-image" :src="iconPath(shortcut.icon)" :alt="shortcut.name" />
        <div class="border-box">
          <p class="icon-text">
            {{ shortcut.name }}
          </p>
        </div>
      </button>
    </li>
    <li v-for="entry in desktopEntries" :key="entry.id">
      <button
        class="icon"
        @touchstart="openEntry(entry, desktopEntries)"
        @dblclick="openEntry(entry, desktopEntries)"
      >
        <img class="icon-image" :src="ENTRY_ICONS[entry.type]" :alt="entry.title" />
        <div class="border-box">
          <p class="icon-text">
            {{ entry.title }}
          </p>
        </div>
      </button>
    </li>
  </nav>
</template>
