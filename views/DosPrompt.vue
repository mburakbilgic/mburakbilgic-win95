<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DosFrame from '@/templates/DosFrame.vue'
import dos from '@/content/dos.json'
import { useDosShell } from '@/composables/useDosShell'
import { useWindowsStore } from '@/stores/windows'
import { DOS_PROMPT_WINDOW_ID } from '@/constants/ui'

const windowsStore = useWindowsStore()
const screenRef = ref(null)
const inputRef = ref(null)
const input = ref('')

const shell = useDosShell({
  onExit: () => windowsStore.setWindowState({ windowState: 'close', windowId: DOS_PROMPT_WINDOW_ID }),
})
const { lines, prompt, mode } = shell

let expiryTimer = null

const scheduleExpiry = (expiresAt) => {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
  if (!expiresAt) return
  expiryTimer = setTimeout(shell.expireSession, Math.max(0, expiresAt - Date.now()))
}

const focusInput = () => {
  if (inputRef.value) inputRef.value.focus({ preventScroll: true })
}

const scrollToBottom = () => {
  const screen = screenRef.value
  if (screen) screen.scrollTop = screen.scrollHeight
}

const onKeydown = async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (mode.value === 'busy') return
    const value = input.value
    input.value = ''
    await shell.submit(value)
    await nextTick()
    focusInput()
    return
  }
  if (event.key === 'Escape') {
    input.value = ''
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const recalled = shell.recall(event.key === 'ArrowUp' ? -1 : 1)
    if (recalled !== null) input.value = recalled
  }
}

watch(() => lines.value.length, () => nextTick(scrollToBottom))
watch(shell.expiresAt, scheduleExpiry)

onMounted(async () => {
  await shell.init()
  focusInput()
})

onBeforeUnmount(() => {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
})
</script>

<template>
  <DosFrame>
    <div ref="screenRef" class="dos-screen" @click="focusInput">
      <div v-for="line in lines" :key="line.id" class="dos-line" :class="line.cls">{{ line.text || ' ' }}</div>
      <div class="dos-line dos-input-line">
        <template v-if="mode !== 'busy'">
          <span>{{ mode === 'password' ? dos.messages.passwordPrompt : prompt }}</span><span>{{ mode === 'password' ? '*'.repeat(input.length) : input }}</span><span class="dos-cursor"></span>
        </template>
        <input
          ref="inputRef"
          v-model="input"
          class="dos-hidden-input"
          :type="mode === 'password' ? 'password' : 'text'"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :aria-label="mode === 'password' ? dos.messages.passwordPrompt : prompt"
          @keydown="onKeydown"
        />
      </div>
    </div>
  </DosFrame>
</template>

<style scoped>
.dos-screen {
  height: 100%;
  overflow: auto;
  padding: 12px 14px 20px;
  font-family: "Perfect DOS VGA 437", "Px437 IBM VGA 9x16", "Consolas", "Lucida Console", "Courier New", monospace;
  color: #c0c0c0;
  font-size: 15px;
  line-height: 1.32;
  -webkit-font-smoothing: none;
  cursor: text;
  user-select: text;
}

.dos-line {
  white-space: pre;
}

.dos-line.err {
  color: #ff5555;
}

.dos-line.ok {
  color: #55ff55;
}

.dos-line.warn {
  color: #ffff55;
}

.dos-input-line {
  position: relative;
}

.dos-cursor {
  display: inline-block;
  width: 10px;
  height: 3px;
  background: #c0c0c0;
  vertical-align: 2px;
  margin-left: 1px;
  animation: dos-blink 1s steps(2, start) infinite;
}

@keyframes dos-blink {
  0%, 50% {
    opacity: 1;
  }
  50.01%, 100% {
    opacity: 0;
  }
}

.dos-hidden-input {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  border: 0;
  padding: 0;
}
</style>
