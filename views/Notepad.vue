<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import notepad from '@/content/notepad.json'
import { useWindowsStore } from '@/stores/windows'
import { useContentStore } from '@/stores/content'
import { fillTemplate } from '@/composables/dosFormat'
import { WINDOW_ID_KEY } from '@/constants/ui'

const windowsStore = useWindowsStore()
const contentStore = useContentStore()
const windowId = inject<string>(WINDOW_ID_KEY, '')
const record = computed(() => windowsStore.getWindowById(windowId) || {})

const text = ref(notepad.loading)
const failed = ref(false)

/**
 * Loads the file through the public read API, so hidden files stay
 * hidden from visitors exactly as in the DOS prompt.
 */
const load = async () => {
  try {
    const file = await $fetch<{ content: string }>('/api/fs/read', { query: { path: record.value.filePath } })
    text.value = file.content
    failed.value = false
  } catch {
    text.value = fillTemplate(notepad.notFound, { name: record.value.fileName || '' })
    failed.value = true
  }
}

onMounted(load)
watch(() => contentStore.version, load)
</script>

<template>
  <div class="notepad">
    <div class="notepad-menu" aria-hidden="true">
      <span v-for="item in notepad.menu" :key="item" class="notepad-menu-item">
        <u>{{ item.charAt(0) }}</u>{{ item.slice(1) }}
      </span>
    </div>
    <textarea
      class="notepad-text"
      :class="{ failed }"
      :value="text"
      readonly
      spellcheck="false"
      :aria-label="record.displayName"
    ></textarea>
  </div>
</template>

<style scoped>
.notepad {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 300px;
  background: rgb(192, 192, 192);
}

.notepad-menu {
  padding: 2px 4px;
  font-size: 13px;
}

.notepad-menu-item {
  margin-right: 12px;
}

.notepad-text {
  flex: 1;
  margin: 0 2px 2px;
  padding: 2px 4px;
  resize: none;
  background: #fff;
  color: #000;
  font-family: "Fixedsys Excelsior", "Lucida Console", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.3;
  white-space: pre-wrap;
  overflow: auto;
  border-top: solid rgb(90, 90, 90) 1.5px;
  border-left: solid rgb(90, 90, 90) 1.5px;
  border-bottom: solid rgb(250, 250, 250) 1.5px;
  border-right: solid rgb(250, 250, 250) 1.5px;
  outline: none;
}

.notepad-text.failed {
  color: rgb(90, 90, 90);
}
</style>
