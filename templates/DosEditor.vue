<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import dos from '@/content/dos.json'
import { fillTemplate } from '@/composables/dosFormat'

const props = defineProps<{
  name: string
  content: string
  readonly: boolean
  save: (content: string) => Promise<{ ok: boolean; message: string }>
}>()
const emit = defineEmits<{ close: [] }>()

const labels = dos.editor
const text = ref(props.content)
const savedText = ref(props.content)
const status = ref('')
const statusIsError = ref(false)
const saving = ref(false)
const menuOpen = ref(false)
const confirmingExit = ref(false)
const cursor = ref({ line: 1, col: 1 })
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const dirty = computed(() => text.value !== savedText.value)
const title = computed(() => (props.readonly ? `${props.name} ${labels.readOnlyTag}` : props.name))
const position = computed(() => fillTemplate(labels.position, cursor.value))

const focusText = () => {
  if (textareaRef.value) textareaRef.value.focus()
}

const updateCursor = () => {
  const el = textareaRef.value
  if (!el) return
  const linesBefore = el.value.slice(0, el.selectionStart).split('\n')
  cursor.value = { line: linesBefore.length, col: linesBefore[linesBefore.length - 1].length + 1 }
}

const onInput = () => {
  status.value = ''
  updateCursor()
}

const save = async (): Promise<boolean> => {
  if (saving.value) return false
  menuOpen.value = false
  saving.value = true
  const content = text.value
  const result = await props.save(content)
  saving.value = false
  if (result.ok) savedText.value = content
  status.value = result.message || (result.ok ? labels.saved : '')
  statusIsError.value = !result.ok
  focusText()
  return result.ok
}

const requestExit = () => {
  menuOpen.value = false
  if (dirty.value) {
    confirmingExit.value = true
    return
  }
  emit('close')
}

const answerExit = async (answer: 'yes' | 'no' | 'cancel') => {
  confirmingExit.value = false
  if (answer === 'no' || (answer === 'yes' && (await save()))) {
    emit('close')
    return
  }
  await nextTick()
  focusText()
}

const insertTab = () => {
  const el = textareaRef.value
  if (!el) return
  el.setRangeText('\t', el.selectionStart, el.selectionEnd, 'end')
  text.value = el.value
  onInput()
}

const onKeydown = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase()
  if (confirmingExit.value) {
    event.preventDefault()
    if (key === 'y') answerExit('yes')
    else if (key === 'n') answerExit('no')
    else if (key === 'escape' || key === 'c') answerExit('cancel')
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault()
    save()
  } else if (event.altKey && key === 'f') {
    event.preventDefault()
    menuOpen.value = !menuOpen.value
  } else if (key === 'escape') {
    event.preventDefault()
    if (menuOpen.value) menuOpen.value = false
    else requestExit()
  } else if (key === 'tab' && event.target === textareaRef.value) {
    event.preventDefault()
    insertTab()
  }
}

onMounted(() => {
  const el = textareaRef.value
  if (!el) return
  el.focus()
  el.setSelectionRange(0, 0)
})
</script>

<template>
  <div class="dos-editor" @keydown="onKeydown">
    <div class="menu-bar">
      <div class="menu">
        <button type="button" class="menu-title" :class="{ open: menuOpen }" tabindex="-1" @click="menuOpen = !menuOpen">
          <span class="hotkey">{{ labels.menuFile.charAt(0) }}</span>{{ labels.menuFile.slice(1) }}
        </button>
        <div v-if="menuOpen" class="menu-drop">
          <button type="button" tabindex="-1" @click="save">
            <span>{{ labels.save }}</span><span>{{ labels.saveShortcut }}</span>
          </button>
          <button type="button" tabindex="-1" @click="requestExit">
            <span>{{ labels.exit }}</span><span>{{ labels.exitShortcut }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="document" @mousedown="menuOpen = false">
      <div class="document-title"><span>{{ title }}</span></div>
      <textarea
        ref="textareaRef"
        v-model="text"
        class="document-text"
        wrap="off"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        :aria-label="title"
        @input="onInput"
        @keyup="updateCursor"
        @click="updateCursor"
      ></textarea>
    </div>

    <div class="status-bar">
      <span class="status-text" :class="{ error: statusIsError }">{{ status || labels.hint }}</span>
      <span class="status-position">{{ position }}</span>
    </div>

    <div v-if="confirmingExit" class="dialog-backdrop">
      <div class="dialog" role="dialog" :aria-label="labels.savePrompt">
        <p>{{ labels.savePrompt }}</p>
        <div class="dialog-buttons">
          <button type="button" tabindex="-1" @click="answerExit('yes')">&lt; {{ labels.yes }} &gt;</button>
          <button type="button" tabindex="-1" @click="answerExit('no')">&lt; {{ labels.no }} &gt;</button>
          <button type="button" tabindex="-1" @click="answerExit('cancel')">&lt; {{ labels.cancel }} &gt;</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dos-editor {
  --edit-blue: #0000aa;
  --edit-gray: #aaaaaa;
  --edit-cyan: #00aaaa;
  --edit-white: #ffffff;
  --edit-black: #000000;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--edit-blue);
  font-family: "Perfect DOS VGA 437", "Px437 IBM VGA 9x16", "Consolas", "Lucida Console", "Courier New", monospace;
  font-size: 15px;
  line-height: 1.32;
  -webkit-font-smoothing: none;
}

button {
  font: inherit;
  border: 0;
  border-radius: 0;
  cursor: pointer;
}

.menu-bar {
  background: var(--edit-gray);
  color: var(--edit-black);
  padding: 0 8px;
}

.menu {
  position: relative;
  display: inline-block;
}

.menu-title {
  background: transparent;
  color: inherit;
  padding: 0 8px;
}

.menu-title.open {
  background: var(--edit-black);
  color: var(--edit-white);
}

.hotkey {
  color: var(--edit-white);
}

.menu-drop {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 2;
  min-width: 180px;
  padding: 2px 0;
  background: var(--edit-gray);
  border: 2px solid var(--edit-black);
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.6);
}

.menu-drop button {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  padding: 0 10px;
  background: transparent;
  color: var(--edit-black);
}

.menu-drop button:hover {
  background: var(--edit-black);
  color: var(--edit-white);
}

.document {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  margin: 10px 6px 4px;
  border: 3px double var(--edit-gray);
}

.document-title {
  position: absolute;
  top: -12px;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
}

.document-title span {
  padding: 0 6px;
  background: var(--edit-gray);
  color: var(--edit-blue);
}

.document-text {
  flex: 1;
  min-height: 0;
  padding: 8px 6px 4px;
  background: transparent;
  color: var(--edit-gray);
  font: inherit;
  white-space: pre;
  overflow: auto;
  border: 0;
  outline: none;
  resize: none;
  caret-color: var(--edit-white);
  tab-size: 8;
}

.document-text::selection {
  background: var(--edit-gray);
  color: var(--edit-blue);
}

.status-bar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
  background: var(--edit-cyan);
  color: var(--edit-black);
  white-space: pre;
}

.status-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-text.error {
  color: var(--edit-white);
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.dialog {
  min-width: 320px;
  padding: 14px 20px 10px;
  background: var(--edit-gray);
  color: var(--edit-black);
  border: 3px double var(--edit-black);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.6);
  text-align: center;
}

.dialog p {
  margin: 0 0 12px;
}

.dialog-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.dialog-buttons button {
  background: transparent;
  color: var(--edit-black);
}

.dialog-buttons button:hover {
  background: var(--edit-black);
  color: var(--edit-white);
}
</style>
