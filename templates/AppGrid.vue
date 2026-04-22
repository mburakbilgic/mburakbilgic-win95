<script setup>
import { onMounted, ref } from 'vue'
import { useWindowsStore } from '@/stores/windows'
import { useImagePath } from '@/composables/useImagePath'

const NAVBAR_OFFSET_PX = 60

const windowsStore = useWindowsStore()
const { iconPath } = useImagePath()

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
    <li v-for="window in windowsStore.windows" :key="window.windowId">
      <button
        class="icon"
        v-if="window.showInAppGrid != false"
        @touchstart="openWindow(window.windowId)"
        @dblclick="openWindow(window.windowId)"
      >
      <img class="icon-image" :src="iconPath(window.iconImage)" :alt="window.altText" />
        <div class="border-box">
          <p class="icon-text">
            {{ window.displayName }}
          </p>
        </div>
      </button>
    </li>
  </nav>
</template>