<script setup lang="ts">
import interact from 'interactjs';
import {
    onMounted,
    onBeforeUnmount,
    provide,
    ref,
    computed
} from 'vue';
import {
    useWindowsStore
} from '@/stores/windows'
import { useImagePath } from '@/composables/useImagePath'
import { SCREEN_FALLBACK_SIZE_PX, WINDOW_ID_KEY, WINDOW_MIN_SIZE_PX } from '@/constants/ui'

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
const { iconPath } = useImagePath()
const window = ref({})
const ComponentName = props.nameOfWindow
provide(WINDOW_ID_KEY, props.nameOfWindow)
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
    windowsStore.setActiveWindow("")
    windowsStore.setWindowState(payload)
}

const closeWindow = () => {
    const payload = {
        windowState: "close",
        windowId: window.value.windowId,
    };
    windowsStore.setWindowState(payload)
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
    }"
    @click="setActiveWindow" 
    @dragstart="setActiveWindow" @click.native="setActiveWindow">
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
    <div class="content">
        <slot class="window-content" name="content"> </slot>
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

.window {
    box-sizing: border-box;
    padding: 0px;
    margin: 0px;
    user-select: none;
    -ms-touch-action: none;
    touch-action: none;
    flex-flow: column;
    display: flex;
}

.fullscreen {
    width: 100% !important;
    height: var(--fullscreen) !important;
    margin: 0;
    transition: all 0.5s ease;
    padding: 0;
}

.content {
    flex-grow: 1;
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

.icon-image {
    width: 15px;
    height: 15px;
    margin-right: 5px;
    margin-top: 0;
    margin-bottom: 0;
}
</style>
