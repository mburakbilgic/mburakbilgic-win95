<script setup lang="ts">
import interact from 'interactjs';
import {
    onMounted,
    onBeforeUnmount,
    ref,
    computed
} from 'vue';
import {
    useWindowsStore
} from '@/stores/windows'
import {
    useMailStore
} from '@/stores/mail'
import { useContent } from '@/composables/useContent'
import { useImagePath } from '@/composables/useImagePath'
import { SCREEN_FALLBACK_SIZE_PX, WINDOW_MIN_SIZE_PX } from '@/constants/ui'

const { site, mail } = useContent()
const { iconPath } = useImagePath()

const props = withDefaults(
    defineProps<{
        windowId?: string
        nameOfWindow?: string
        contentPaddingLeft?: string
        contentPaddingRight?: string
        contentPaddingTop?: string
        contentPaddingBottom?: string
    }>(),
    {
        contentPaddingLeft: '15%',
        contentPaddingRight: '15%',
        contentPaddingTop: '5%',
        contentPaddingBottom: '5%',
    },
)

const position = ref({
    x: 0,
    y: 0
})
const tempPosition = ref({
    x: 0,
    y: 0
})
const windowsStore = useWindowsStore()
const mailStore = useMailStore()
const window = ref({})
const ComponentName = props.nameOfWindow
const w = ref(400)
const h = ref(400)

const style = computed(() => ({
    height: `${h.value}px`,
    width: `${w.value}px`,
    transform: `translate(${position.value.x}px, ${position.value.y}px)`,
    "--content-padding-left": props.contentPaddingLeft || "15%",
    "--content-padding-right": props.contentPaddingRight || "15%",
    "--content-padding-top": props.contentPaddingTop || "5%",
    "--content-padding-bottom": props.contentPaddingBottom || "5%",
    "--fullscreen": windowsStore.getFullscreenWindowHeight,
}));

const setActiveWindow = () => {
    windowsStore.setActiveWindow(window.value.windowId)
    windowsStore.zIndexIncrement(window.value.windowId)
}

const toggleWindowSize = () => {
    if (windowsStore.getWindowFullscreen(window.value.windowId) == true) {
        const payload = {
            fullscreen: false,
            windowId: window.value.windowId,
        };
        windowsStore.setFullscreen(payload)
        position.value.x = tempPosition.value.x
        position.value.y = tempPosition.value.y
    } else if (
        windowsStore.getWindowFullscreen(window.value.windowId) == false
    ) {
        const payload = {
            fullscreen: true,
            windowId: window.value.windowId,
        };
        windowsStore.setFullscreen(payload)
        const tempX = position.value.x
        const tempY = position.value.y
        tempPosition.value.x = tempX
        tempPosition.value.y = tempY
        position.value.x = 0
        position.value.y = 0
    }
}

const minimizeWindow = () => {
    const payload = {
        windowState: "minimize",
        windowId: window.value.windowId,
    };
    windowsStore.setWindowState(payload)
}

const closeWindow = () => {
    const payload = {
        windowState: "close",
        windowId: window.value.windowId,
    };
    windowsStore.setWindowState(payload)
}

const mailSubject = computed({
    get: () => mailStore.mailSubject,
    set: (v: string) => mailStore.setMailSubject(v),
})

const headerSubject = computed(() => mailStore.mailSubject.trim() || mail.defaultSubject)

const mailSender = computed({
    get: () => mailStore.mailSender,
    set: (v: string) => mailStore.setMailSender(v),
})

const mailContent = computed({
    get: () => mailStore.mailContent,
    set: (v: string) => mailStore.setMailContent(v),
})

const honeypot = ref('')
const isSending = ref(false)
const dialog = ref<{ title: string; message: string; success: boolean } | null>(null)

const errorMessage = (error: unknown): string => {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    const messages = mail.error.messages as Record<string, string>
    return (code && messages[code]) || messages.UNKNOWN
}

const sendEmail = async () => {
    if (isSending.value) return
    isSending.value = true
    try {
        await $fetch('/api/mail', {
            method: 'POST',
            body: {
                subject: mailStore.mailSubject,
                sender: mailStore.mailSender,
                content: mailStore.mailContent,
                website: honeypot.value,
            },
        })
        dialog.value = { title: mail.success.title, message: mail.success.message, success: true }
    } catch (error) {
        dialog.value = { title: mail.error.title, message: errorMessage(error), success: false }
    } finally {
        isSending.value = false
    }
}

const closeDialog = () => {
    const wasSuccess = dialog.value?.success
    dialog.value = null
    if (wasSuccess) {
        mailStore.resetMail()
        closeWindow()
    }
}

let isDragging = false;
let draggableWindow = null;

onMounted(() => {
    window.value = windowsStore.getWindowById(ComponentName)
    if (!window.value) return
    const screen = document.getElementById('screen')
    const screenWidth = screen ? screen.clientWidth : SCREEN_FALLBACK_SIZE_PX
    const screenHeight = screen ? screen.clientHeight : SCREEN_FALLBACK_SIZE_PX

    draggableWindow = interact("#" + window.value.windowId)
    draggableWindow
        .draggable({
            listeners: {
                move(event) {
                    position.value.x += event.dx
                    position.value.y += event.dy
                }
            },
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: '#screen',
                    endOnly: true
                }),
            ],
            allowFrom: '#top-bar'
        })
        .on('dragstart', () => {
            isDragging = true;
        })
        .on('dragmove', () => {
            if (isDragging) {
                setActiveWindow();
                isDragging = false;
            }
        })
        .on('dragend', () => {
            isDragging = false;
        })
        .resizable({
            edges: {
                left: true,
                right: true,
                bottom: true,
                top: false
            },
            listeners: {
                move(event) {
                    const target = event.target
                    w.value = event.rect.width
                    h.value = event.rect.height
                    target.style.width = `${w.value}px`
                    target.style.height = `${h.value}px`
                    position.value.x += event.deltaRect.left
                    position.value.y += event.deltaRect.top
                }
            },
            modifiers: [
                interact.modifiers.restrictSize({
                    min: {
                        width: WINDOW_MIN_SIZE_PX,
                        height: WINDOW_MIN_SIZE_PX
                    },
                    max: {
                        width: screenWidth - position.value.x,
                        height: screenHeight - position.value.y
                    }
                }),
            ],
        })
})

onBeforeUnmount(() => {
    if (draggableWindow) draggableWindow.unset()
})
</script>

<template>
<div :id="window.windowId" :style="style" class="window window-style" :class="{
            'fullscreen': window.fullscreen == true,
            'minimize': window.fullscreen == 'minimize',
        }" @click="setActiveWindow" @dragstart="setActiveWindow" @click.native="setActiveWindow">
    <form @submit.prevent="sendEmail" class="window-style" id="container" novalidate>
        <div id="top-bar" class="top-bar-window" :class="
            windowsStore.activeWindow == window.windowId
                ? 'top-bar'
                : 'top-bar-deactivated'
            " @dblclick="toggleWindowSize">
            <div class="window-name">
                <img class="icon-image" :src="iconPath(window.iconImage)" :alt="window.altText" />{{ window.displayName }}
            </div>
            <div class="triple-button">
                <button class="minimize-button button" @click="minimizeWindow">
                    <span style="
                    height: 2px;
                    width: 6px;
                    background: black;
                    margin-top: 8px;
                    margin-right: 2px;
                ">
                    </span>
                </button>
                <button class="expand-button button" @click="toggleWindowSize">
                    <span style="
                    height: 8px;
                    width: 9px;
                    border-left: black 1px solid;
                    border-right: black 1px solid;
                    border-left: black 1px solid;
                    border-bottom: black 1px solid;
                    border-top: black 2px solid;
                ">
                    </span>
                </button>
                <button class="close-button button" style="margin-right: 3px; padding-left: 1px" @click="closeWindow">
                    ×
                </button>
            </div>
        </div>

        <div class="send-bar">
            <button type="submit" class="sent" style="z-index: 10" :disabled="isSending">
                <span class="border-box">
                    <img src="@/assets/Mail/send.png" class="icon-image" />
                    <p style="margin-top: 2px; color: black">{{ isSending ? mail.sendingLabel : mail.sendLabel }}</p>
                </span>
            </button>
        </div>

        <div class="content">
            <div class="container-details">
                <div class="header">{{ headerSubject }}</div>
                <hr />
                <div class="subject-container">
                    <p style="margin: 8px">{{ mail.toLabel }}</p>
                    <div class="receipient">{{ site.mailRecipientLabel }}</div>
                </div>
                <hr />
                <div class="subject-container">
                    <p style="margin: 8px">{{ mail.subjectLabel }}</p>
                    <input name="subject" class="subject" v-model="mailSubject" type="text" maxlength="200" />
                </div>
                <hr />
                <div class="from-container" style="margin-bottom: 2px">
                    <p style="margin: 8px">{{ mail.fromLabel }}</p>
                    <input name="sender" class="subject" v-model="mailSender" type="email" maxlength="254" />
                </div>
            </div>

            <textarea name="content" v-model="mailContent" maxlength="5000"></textarea>
            <input v-model="honeypot" name="website" class="honeypot" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" />
        </div>
    </form>

    <div v-if="dialog" class="dialog-overlay" @click.stop>
        <div class="dialog" role="alertdialog" :aria-label="dialog.title">
            <div class="top-bar top-bar-window">
                <div class="window-name">{{ dialog.title }}</div>
            </div>
            <div class="dialog-body">
                <span class="dialog-icon" :class="dialog.success ? 'dialog-icon-info' : 'dialog-icon-error'">{{ dialog.success ? 'i' : '×' }}</span>
                <span class="dialog-message">{{ dialog.message }}</span>
            </div>
            <div class="dialog-actions">
                <button type="button" class="sent dialog-ok" @click="closeDialog">{{ mail.okLabel }}</button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
/*-------------------------------------------*\
    Windows/Display
\*-------------------------------------------*/

.minimize {
    display: none;
}

.window-style {
    box-sizing: border-box;
    padding: 0px;
    margin: 0px;
    user-select: none;
    -ms-touch-action: none;
    touch-action: none;
    flex-flow: column;
    display: flex;
    max-width: 100vw !important;
}

.fullscreen {
    width: 100% !important;
    height: var(--fullscreen) !important;
    margin: 0;
    transition: all 0.5s ease;
    padding: 0;
}

.content {
    flex-direction: column;
    flex-grow: 1;
    height: var(--fullscreen) !important;
    overflow: hidden;
    display: flex;
    overflow-x: hidden;
    padding-right: var(--content-padding-right);
    padding-left: var(--content-padding-left);
    padding-top: var(--content-padding-top);
    padding-bottom: var(--content-padding-bottom);
}

/*-------------------------------------------*\
    Top Bar
\*-------------------------------------------*/

.top-bar {
    background: rgb(0, 0, 124);
}

.icon-image {
    width: 15px;
    height: 15px;
    margin-right: 5px;
    margin-top: 0;
    margin-bottom: 0;
}

.top-bar-window {
    display: flex;
    width: auto;
    align-items: center;
    justify-content: space-between;
    flex-direction: row;
    z-index: 10;
    margin: 2px;
    padding: 2px 2px 2px 2px;
}

.top-bar-deactivated {
    background: rgb(123, 125, 123);
}

.top-bar:hover {
    cursor: default;
}

.window-name {
    color: white;
    display: flex;
    align-items: center;
    font-weight: 500;
    padding: 0;
    font-size: 16px;
    margin: 0 0 0 3px;
}

.subject {
    width: 100%;
    background: none;
    border: none;
}

p {
    color: rgb(155, 155, 155);
    margin-right: 5px;
    font-size: 14px;
    margin: 0 0 0 0;
    padding: 0 0 0 0;
}

button {
    outline: none;
}

hr {
    background-color: rgb(155, 155, 155, 0.2);
    width: 100%;
}

.sent {
    vertical-align: middle;
    box-shadow: 1.5px 1.5px black;
    border-top: solid rgb(250, 250, 250) 1.5px;
    border-left: solid rgb(250, 250, 250) 1.5px;
    border-bottom: solid rgb(90, 90, 90) 1.5px;
    border-right: solid rgb(90, 90, 90) 1.5px;
    background: rgb(192, 192, 192);
    padding: 1px;
}

.sent:active {
    box-shadow: none;
    background: repeating-conic-gradient(rgb(189, 190, 189) 0% 25%,
            rgb(255, 255, 255) 0% 50%) 50% / 2px 2px;
    border-top: solid rgb(0, 0, 0) 1.5px;
    border-bottom: solid rgb(250, 250, 250) 1.5px;
    border-right: solid rgb(250, 250, 250) 1.5px;
}

.border-box {
    display: flex;
    justify-content: center;
    align-items: center;
    border: 1px solid transparent;
}

.border:active {
    border: black dotted 1px;
}

.sent:hover {
    cursor: pointer;
}

.container-details {
    border: 1px white solid;
    background: white;
    width: 100%;
    padding: 0px;
    margin: 0px;
}

.header {
    font-weight: 700;
    font-size: 24px;
    padding-top: 10px;
    margin-left: 8px;
    text-overflow: ellipsis;
    overflow: auto;
    max-width: auto;
}

.send-bar {
    border: 1px white solid;
    outline: 1px rgb(123, 125, 123) solid;
    font-size: 12px;
    padding: 4px;
    margin: 2px;
}

.receipient {
    background: rgb(194, 214, 252);
    padding-left: 5px;
    padding-right: 5px;
    border-radius: 3px;
    font-size: 14px;
}

.subject-container {
    display: flex;
    height: 35px !important;
    align-items: center;
}

.from-container {
    display: flex;
    height: 35px !important;
    align-items: center;
}

input {
    outline: none;
}

.honeypot {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    opacity: 0;
}

.sent:disabled {
    cursor: wait;
    opacity: 0.7;
}

.dialog-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.1);
    z-index: 20;
}

.dialog {
    min-width: 260px;
    max-width: 90%;
    background: rgb(192, 192, 192);
    border-top: solid rgb(250, 250, 250) 1.5px;
    border-left: solid rgb(250, 250, 250) 1.5px;
    border-bottom: solid rgb(90, 90, 90) 1.5px;
    border-right: solid rgb(90, 90, 90) 1.5px;
    box-shadow: 1.5px 1.5px black;
}

.dialog-body {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 14px 8px;
    font-size: 14px;
    color: black;
}

.dialog-icon {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 18px;
    color: white;
}

.dialog-icon-info {
    background: rgb(0, 0, 124);
    font-family: serif;
}

.dialog-icon-error {
    background: rgb(200, 0, 0);
}

.dialog-actions {
    display: flex;
    justify-content: center;
    padding: 8px 0 12px;
}

.dialog-ok {
    min-width: 72px;
    color: black;
}

textarea {
    margin: 0;
    background: none;
    border-top: solid rgb(0, 0, 0) 1.5px;
    border-left: solid rgb(0, 0, 0) 1.5px;
    border-bottom: solid rgb(250, 250, 250) 1.5px;
    border-right: solid rgb(250, 250, 250) 1.5px;
    -webkit-box-shadow: none;
    -moz-box-shadow: none;
    box-shadow: none;
    resize: none;
    caret-color: black;
    color: black;
    font-size: 14px;
    border-radius: 0;
    flex-grow: 1;
    width: 100% !important;
}
</style>
