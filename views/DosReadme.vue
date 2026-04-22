<script setup>
import {ref, onMounted, getCurrentInstance} from 'vue'
import {useWindowsStore} from '@/stores/windows'

/**
 * DosReadme — content of the Win95 MS-DOS Prompt window.
 *
 * Resolves the matching window record from the store via the parent
 * Window.vue's `nameOfWindow` prop, then fetches the GitHub README
 * using the `dosProject` field on that record.
 *
 * Design notes (faithful to the Win95 MS-DOS Prompt):
 *   - No CRT scanline / flicker (the original had none).
 *   - No "Path:" info bar — the path is shown in the shell prompt itself.
 *   - A cosmetic toolbar sits below the titlebar (font size, Mark, Copy,
 *     Paste, Full-screen, Properties, Background, Font). The buttons are
 *     purely visual — no functionality.
 *   - Screen font: Perfect DOS VGA 437 (CDN, fallback Consolas/Lucida Console).
 *   - Boot text drops in instantly ("Microsoft(R) Windows 95" +
 *     "(C)Copyright Microsoft Corp 1981-1996."), followed by typewriter
 *     commands + a byte-stream progress bar during the fetch.
 */
const windowsStore = useWindowsStore()
const screenRef = ref(null)

const loadMarked = () => new Promise((resolve, reject) => {
  if (window.marked) return resolve(window.marked)
  const s = document.createElement('script')
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
  s.onload = () => resolve(window.marked)
  s.onerror = reject
  document.head.appendChild(s)
})

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function typeLine(screen, text, cls, cps, prefix = '', idleBeforeMs = 0) {
  const line = document.createElement('div')
  line.className = 'dos-boot-line' + (cls ? ' ' + cls : '')
  if (prefix) line.appendChild(document.createTextNode(prefix))
  screen.appendChild(line)
  const cursor = document.createElement('span')
  cursor.className = 'dos-typewriter-cursor'
  line.appendChild(cursor)
  screen.scrollTop = screen.scrollHeight
  if (idleBeforeMs > 0) await wait(idleBeforeMs)
  for (let i = 0; i < text.length; i++) {
    cursor.insertAdjacentText('beforebegin', text[i])
    await wait(1000 / (cps || 9))
  }
  cursor.remove()
  if (text === '' && !prefix) line.innerHTML = '&nbsp;'
  screen.scrollTop = screen.scrollHeight
}

async function fetchReadme(project, onProgress) {
  if (!project.owner || !project.repo) return null
  const branches = [project.branch || 'main', 'master']
  const fileNames = ['README.md', 'readme.md', 'Readme.md']
  const attempts = []
  for (const branch of branches) {
    for (const fileName of fileNames) {
      attempts.push({
        branch, fileName,
        url: `https://raw.githubusercontent.com/${project.owner}/${project.repo}/${branch}/${fileName}`,
      })
    }
  }
  let lastErr
  for (const {url, branch, fileName} of attempts) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue
      }
      const total = parseInt(res.headers.get('Content-Length') || '0', 10) || 0
      const reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (!reader) {
        const text = await res.text()
        const bytes = new Blob([text]).size
        if (onProgress) onProgress({received: bytes, total: total || bytes, branch, fileName})
        if (text) return {text, bytes, branch, fileName}
        continue
      }
      const decoder = new TextDecoder('utf-8')
      const chunks = []
      let received = 0
      while (true) {
        const {done, value} = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.byteLength
        if (onProgress) onProgress({received, total, branch, fileName})
      }
      let text = ''
      for (const c of chunks) text += decoder.decode(c, {stream: true})
      text += decoder.decode()
      if (onProgress) onProgress({received, total: total || received, branch, fileName})
      if (text) return {text, bytes: received, branch, fileName}
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('README not found')
}

function placeholderReadme(p) {
  return `# ${p.title}\n\n> ${p.description || ''}\n\nPlaceholder README — configure \`owner\` and \`repo\` in the manifest.\n`
}

function rewriteLinks(holder, project, fetchedBranch) {
  const {owner, repo} = project
  if (!owner || !repo) return
  const branch = fetchedBranch || project.branch || 'main'
  const repoBase = `https://github.com/${owner}/${repo}`
  const blobBase = `${repoBase}/blob/${branch}`
  holder.querySelectorAll('a[href]').forEach((a) => {
    const raw = a.getAttribute('href') || ''
    if (!raw) return
    const isAbsolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)
    let next = raw
    if (raw.startsWith('#')) next = `${repoBase}${raw}`
    else if (!isAbsolute) {
      const clean = raw.replace(/^\.\//, '')
      next = clean.startsWith('/') ? `${repoBase}${clean}` : `${blobBase}/${clean}`
    }
    a.setAttribute('href', next)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  })
}

async function renderMarkdown(screen, md, project, fetchedBranch) {
  const marked = await loadMarked().catch(() => null)
  const holder = document.createElement('div')
  holder.className = 'dos-md'
  try {
    holder.innerHTML = marked ? marked.parse(md, {gfm: true}) : md
  } catch {
    holder.textContent = md
  }
  rewriteLinks(holder, project, fetchedBranch)
  screen.appendChild(holder)
  screen.scrollTop = screen.scrollHeight
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

async function boot(project) {
  const screen = screenRef.value
  if (!screen) return
  screen.innerHTML = ''
  const repoUpper = (project.repo || project.id || 'README').toUpperCase()

  const instant = (html, cls) => {
    const line = document.createElement('div')
    line.className = 'dos-boot-line' + (cls ? ' ' + cls : '')
    line.innerHTML = html
    screen.appendChild(line)
  }

  // Win95 MS-DOS Prompt boot lines — instant (no typewriter animation)
  instant('Microsoft(R) Windows 95')
  instant('(C)Copyright Microsoft Corp 1981-1996.')
  instant('&nbsp;')

  // Prompt appears instantly with a blinking idle cursor, then the command is typed
  await typeLine(screen, `cd \\PROJECTS\\${repoUpper}`, '', 16, `C:\\WINDOWS>`, 850)
  await wait(260)
  await typeLine(screen, `type README.MD`, '', 16, `C:\\PROJECTS\\${repoUpper}>`, 600)
  await wait(280)
  instant('&nbsp;')

  // Progress bar — driven by the actual byte stream
  const progWrap = document.createElement('div')
  progWrap.className = 'dos-boot-line'
  progWrap.innerHTML = `[<span class="bar"></span><span class="barRest" style="color:#7b7b7b"></span>] <span class="pct">  0%</span> <span class="bytes" style="color:#7b7b7b"></span>`
  screen.appendChild(progWrap)
  const bar = progWrap.querySelector('.bar')
  const barRest = progWrap.querySelector('.barRest')
  const pct = progWrap.querySelector('.pct')
  const bytesEl = progWrap.querySelector('.bytes')
  const WIDTH = 30
  let lastRatio = -1
  const paint = ({received, total}) => {
    if (total > 0) {
      const ratio = Math.min(1, received / total)
      if (Math.abs(ratio - lastRatio) < 0.01 && ratio < 1) return
      lastRatio = ratio
      const filled = Math.round(ratio * WIDTH)
      bar.textContent = '█'.repeat(filled)
      barRest.textContent = '░'.repeat(WIDTH - filled)
      pct.textContent = String(Math.round(ratio * 100)).padStart(3, ' ') + '%'
      bytesEl.textContent = `${formatBytes(received)} / ${formatBytes(total)}`
    } else {
      bar.textContent = '█'.repeat(WIDTH)
      barRest.textContent = ''
      pct.textContent = '   ?'
      bytesEl.textContent = formatBytes(received)
    }
    screen.scrollTop = screen.scrollHeight
  }

  let fetched = null, fetchErr = null
  try {
    fetched = await fetchReadme(project, paint)
  } catch (e) {
    fetchErr = e
  }
  instant('&nbsp;')

  if (fetchErr) {
    await typeLine(screen, `! Cannot fetch README.MD — showing placeholder.`, 'err', 18)
    await wait(250)
    await renderMarkdown(screen, placeholderReadme(project), project)
  } else if (!fetched) {
    await typeLine(screen, `  No repo configured — placeholder shown.`, 'dim', 18)
    await wait(250)
    await renderMarkdown(screen, placeholderReadme(project), project)
  } else {
    await typeLine(
        screen,
        `OK — ${formatBytes(fetched.bytes)} received from ${fetched.branch}/${fetched.fileName}.`,
        'ok', 18,
    )
    await wait(250)
    await renderMarkdown(screen, fetched.text, project, fetched.branch)
  }

  // Final prompt
  await wait(300)
  const promptLine = document.createElement('div')
  promptLine.className = 'dos-boot-line'
  promptLine.innerHTML = `C:\\PROJECTS\\${repoUpper}>`
  const finalCursor = document.createElement('span')
  finalCursor.className = 'dos-typewriter-cursor'
  promptLine.appendChild(finalCursor)
  screen.appendChild(promptLine)
  screen.scrollTop = screen.scrollHeight
}

onMounted(() => {
  const parent = getCurrentInstance()?.parent
  const windowId = parent?.props?.nameOfWindow || parent?.props?.windowId
  let project = null
  if (windowId) {
    const w = windowsStore.getWindowById(windowId)
    project = w?.dosProject
  }
  if (!project) project = {title: 'README', owner: '', repo: '', id: 'readme'}
  boot(project)
})
</script>

<template>
  <div class="dos-wrapper">
    <!-- Win95 MS-DOS Prompt toolbar (cosmetic) -->
    <div class="dos-toolbar" aria-hidden="true">
      <div class="font-dd" title="Font size">
        <span class="dd-text">8 x 12</span>
        <span class="dd-arrow">▾</span>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Mark">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="#000" stroke-dasharray="2 1"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Copy">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="3.5" width="8" height="9" fill="#fff" stroke="#000"/>
          <rect x="4.5" y="1.5" width="8" height="9" fill="#fff" stroke="#000"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Paste">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="2.5" y="2.5" width="9" height="10" fill="#d9d9c0" stroke="#000"/>
          <rect x="4.5" y="1.5" width="5" height="2" fill="#808080" stroke="#000"/>
        </svg>
      </button>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Full-screen">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="#000080" stroke="#000"/>
          <rect x="3" y="3" width="8" height="8" fill="#c0c0c0"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Properties">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="2.5" width="11" height="9" fill="#fff" stroke="#000"/>
          <line x1="3" y1="5" x2="11" y2="5" stroke="#000"/>
          <line x1="3" y1="7" x2="11" y2="7" stroke="#000"/>
          <line x1="3" y1="9" x2="9" y2="9" stroke="#000"/>
        </svg>
      </button>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Background">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="#008080" stroke="#000"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Font"
              style="font-family:'Times New Roman',serif;font-weight:700;font-size:13px;line-height:1;">A
      </button>
    </div>

    <div class="dos-screen-frame">
      <div class="dos-screen" ref="screenRef"></div>
    </div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: "Perfect DOS VGA 437";
  src: url("https://cdn.jsdelivr.net/gh/Dafnns/perfect-dos-vga-437@master/Perfect%20DOS%20VGA%20437.ttf") format("truetype");
  font-display: swap;
}

.dos-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #c0c0c0;
}

/* Toolbar */
.dos-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 4px;
  background: #c0c0c0;
  border-bottom: 1px solid #808080;
  flex-shrink: 0;
}

.dos-toolbar .font-dd {
  display: flex;
  align-items: center;
  background: #fff;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
  padding: 1px 2px 1px 4px;
  font-family: "MS Sans Serif", Tahoma, sans-serif;
  font-size: 11px;
  min-width: 68px;
  height: 20px;
  cursor: default;
}

.dos-toolbar .font-dd .dd-text {
  flex: 1;
  color: #000;
}

.dos-toolbar .font-dd .dd-arrow {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #c0c0c0;
  border-top: 1px solid #fafafa;
  border-left: 1px solid #fafafa;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  margin-left: 3px;
  font-size: 9px;
  color: #000;
}

.dos-toolbar .tb-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  background: #c0c0c0;
  border-top: 1px solid #fafafa;
  border-left: 1px solid #fafafa;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  color: #000;
}

.dos-toolbar .tb-btn:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}

.dos-toolbar .tb-sep {
  width: 1px;
  height: 18px;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  margin: 0 2px;
}

/* Screen frame (sunken) */
.dos-screen-frame {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
  margin: 2px;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}

.dos-screen {
  height: 100%;
  overflow: auto;
  padding: 12px 14px 20px;
  font-family: "Perfect DOS VGA 437", "Px437 IBM VGA 9x16", "Consolas", "Lucida Console", "Courier New", monospace;
  color: #c0c0c0;
  font-size: 17px;
  line-height: 1.32;
  -webkit-font-smoothing: none;
  font-smooth: never;
  position: relative;
  z-index: 2;
}

/* Underscore blink cursor (Win95 MS-DOS) */
.dos-typewriter-cursor {
  display: inline-block;
  width: 10px;
  height: 3px;
  background: #c0c0c0;
  vertical-align: 2px;
  margin-left: 1px;
  animation: dosblink 1s steps(2, start) infinite;
}

@keyframes dosblink {
  0%, 50% {
    opacity: 1;
  }
  50.01%, 100% {
    opacity: 0;
  }
}

.dos-boot-line {
  display: block;
}

.dos-boot-line.warn {
  color: #ffff55;
}

.dos-boot-line.ok {
  color: #55ff55;
}

.dos-boot-line.err {
  color: #ff5555;
}

.dos-boot-line.dim {
  color: #7b7b7b;
}

/* Markdown render inside DOS screen */
.dos-screen :deep(.dos-md) {
  font-family: "Perfect DOS VGA 437", Consolas, "Lucida Console", monospace;
  font-size: 17px;
  line-height: 1.4;
}

.dos-screen :deep(.dos-md p) {
  margin: 0 0 .6em;
}

.dos-screen :deep(.dos-md strong), .dos-screen :deep(.dos-md b) {
  color: #fff;
  font-weight: 400;
}

.dos-screen :deep(.dos-md em), .dos-screen :deep(.dos-md i) {
  color: #ffff55;
  font-style: normal;
}

.dos-screen :deep(.dos-md a) {
  color: #55ffff;
  text-decoration: underline;
}

.dos-screen :deep(.dos-md h1),
.dos-screen :deep(.dos-md h2),
.dos-screen :deep(.dos-md h3),
.dos-screen :deep(.dos-md h4) {
  color: #ffff55;
  font-weight: 400;
  margin: 1em 0 .35em;
  letter-spacing: .5px;
}

.dos-screen :deep(.dos-md h1) {
  font-size: 24px;
}

.dos-screen :deep(.dos-md h2) {
  font-size: 21px;
}

.dos-screen :deep(.dos-md h3) {
  font-size: 19px;
}

.dos-screen :deep(.dos-md h1::before) {
  content: "═══ ";
  color: #7b7b7b;
}

.dos-screen :deep(.dos-md h1::after) {
  content: " ═══";
  color: #7b7b7b;
}

.dos-screen :deep(.dos-md h2::before) {
  content: "── ";
  color: #7b7b7b;
}

.dos-screen :deep(.dos-md h2::after) {
  content: " ──";
  color: #7b7b7b;
}

.dos-screen :deep(.dos-md h3::before) {
  content: "» ";
  color: #7b7b7b;
}

.dos-screen :deep(.dos-md ul), .dos-screen :deep(.dos-md ol) {
  margin: .3em 0 .8em 1.6em;
}

.dos-screen :deep(.dos-md ul li) {
  list-style: none;
  position: relative;
  margin-bottom: .2em;
}

.dos-screen :deep(.dos-md ul li::before) {
  content: "›";
  position: absolute;
  left: -1em;
  color: #55ff55;
}

.dos-screen :deep(.dos-md pre) {
  background: #111;
  color: #ffff55;
  border-left: 2px solid #55ff55;
  padding: 8px 10px;
  margin: .6em 0;
  overflow-x: auto;
  font-family: "Perfect DOS VGA 437", Consolas, "Lucida Console", monospace;
  font-size: 15px;
  line-height: 1.4;
}

.dos-screen :deep(.dos-md code) {
  font-family: "Perfect DOS VGA 437", Consolas, "Lucida Console", monospace;
  font-size: 15px;
  color: #ffff55;
  background: #1a1a1a;
  padding: 1px 5px;
}

.dos-screen :deep(.dos-md pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
  color: inherit;
}

.dos-screen :deep(.dos-md blockquote) {
  border-left: 2px solid #55ffff;
  padding: 4px 10px;
  margin: .6em 0;
  color: #55ffff;
}

.dos-screen :deep(.dos-md hr) {
  border: 0;
  height: 0;
  margin: .8em 0;
}

.dos-screen :deep(.dos-md hr::before) {
  content: "────────────────────────────────────────────────────────────────";
  display: block;
  color: #7b7b7b;
  letter-spacing: -1px;
  overflow: hidden;
}

.dos-screen :deep(.dos-md table) {
  border-collapse: collapse;
  margin: .6em 0;
  font-size: 16px;
}

.dos-screen :deep(.dos-md th), .dos-screen :deep(.dos-md td) {
  border: 1px solid #7b7b7b;
  padding: 3px 8px;
}

.dos-screen :deep(.dos-md th) {
  color: #ffff55;
}

.dos-screen :deep(.dos-md img) {
  max-width: 100%;
  filter: contrast(1.1) saturate(.8);
  border: 1px solid #7b7b7b;
  margin: .4em 0;
}
</style>
