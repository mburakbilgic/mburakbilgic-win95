<script setup>
import { useWindowsStore } from '@/stores/windows'
import { useContent } from '@/composables/useContent'

const windowsStore = useWindowsStore()
const { projects, site } = useContent()

const getRndInteger = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const openDos = (project) => {
  const windowId = `DosWindow-${project.id}`

  const existing = windowsStore.getWindowById(windowId)
  if (existing) {
    windowsStore.setWindowState({ windowState: "open", windowId })
    return
  }

  const addWindowPayload = {
    windowId,
    windowState: "close",
    displayName: `MS-DOS — ${project.title}`,
    windowComponent: "window",
    windowContent: "dosReadme",
    windowContentPadding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    position: "absolute",
    positionX: getRndInteger(8, 18) + "vw",
    positionY: getRndInteger(8, 18) + "vh",
    iconImage: "msdos.png",
    altText: project.title,
    fullscreen: false,
    showInAppGrid: false,
    showInNavbar: true,
    dosProject: project,
  }
  windowsStore.pushNewWindow(addWindowPayload)
  windowsStore.setWindowState({ windowState: "open", windowId })
}
</script>

<template>
  <div class="projects-root">
    <div class="addr-bar">
      <span class="addr-label">Address:</span>
      <div class="addr-input">{{ site.projectsAddressBar }}</div>
    </div>

    <div class="body">
      <ul class="proj-grid">
        <li v-for="p in projects" :key="p.id">
          <button class="proj-tile" @dblclick="openDos(p)" @touchstart="openDos(p)">
            <div class="dos-icon-base">
              <div class="dos-icon">
                <div class="dos-line">C:\&gt;<span class="caret"></span></div>
              </div>
              <div class="stand"></div>
              <div class="foot"></div>
            </div>
            <div class="tile-label">{{ p.title }}</div>
          </button>
        </li>
      </ul>
    </div>

    <div class="statusbar">
      <div class="cell">{{ projects.length }} object(s)</div>
      <div class="cell">Double-click a project to open its README.md</div>
    </div>
  </div>
</template>

<style scoped>
.projects-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #c0c0c0;
  font-family: "MS Sans Serif", Tahoma, sans-serif;
  font-size: 12px;
}

.addr-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 6px;
  border-bottom: 1px solid #808080;
}
.addr-bar .addr-label { color: #606060; }
.addr-bar .addr-input {
  flex: 1;
  background: #fff;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
  padding: 2px 4px;
  font-family: monospace;
}

.body {
  flex: 1;
  background: #fff;
  margin: 2px;
  padding: 10px;
  overflow: auto;
  border-top: 1px solid #000;
  border-left: 1px solid #000;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}

.proj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 14px 6px;
  list-style: none; padding: 0; margin: 0;
}
.proj-tile {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px; border: 1px dotted transparent;
  background: none; cursor: pointer;
  width: 100%;
}
.proj-tile:focus, .proj-tile:focus-visible { outline: none; border-color: #000; }
.proj-tile:focus .tile-label { background: #00007b; color: #fff; }

.dos-icon-base {
  width: 48px; display: flex; flex-direction: column; align-items: center;
}
.dos-icon {
  width: 48px; height: 38px;
  background: #000;
  border-top: 2px solid #666;
  border-left: 2px solid #666;
  border-right: 2px solid #222;
  border-bottom: 2px solid #222;
  position: relative;
  display: flex; align-items: flex-end;
  padding: 3px 4px;
  font-family: "VT323", "Courier New", monospace;
  color: #c0c0c0;
  font-size: 12px;
  line-height: 1;
  overflow: hidden;
}
.dos-icon::before {
  content: ""; position: absolute; inset: 0;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 2px);
  pointer-events: none;
}
.dos-line { white-space: nowrap; }
.caret {
  display: inline-block; width: 6px; height: 9px;
  background: #c0c0c0; vertical-align: -1px; margin-left: 1px;
  animation: dosblink 1s steps(2, start) infinite;
}
.stand { width: 36px; height: 4px; background: #808080; border-top: 1px solid #555; border-bottom: 1px solid #222; margin-top: -1px; }
.foot  { width: 22px; height: 3px; background: #808080; border-top: 1px solid #555; border-bottom: 1px solid #222; }

@keyframes dosblink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

.tile-label {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.15;
  max-width: 86px;
  padding: 1px 3px;
  color: #000;
  word-break: break-word;
  text-align: center;
}

.statusbar { display: flex; padding: 2px; font-size: 11px; }
.statusbar .cell {
  flex: 1; margin-right: 2px; padding: 2px 6px;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}
.statusbar .cell:last-child { margin-right: 0; }
</style>
