import { computed, ref } from 'vue'
import dos from '@/content/dos.json'
import { DOS_EOF_CHAR, DOS_HISTORY_MAX } from '@/constants/ui'
import { useContentRefresh } from '@/composables/useContentRefresh'
import {
  applyRenamePattern,
  fillTemplate,
  formatAttribLine,
  formatDirListing,
  formatTree,
  hasWildcard,
  isSameOrInside,
  joinDosPath,
  matchesWildcard,
  parseCommandLine,
  resolveDosPath,
  splitRedirect,
} from '@/composables/dosFormat'

const PAYLOAD_TOO_LARGE = 413
const SUMMARY_INDENT = '        '
const CONFIRM_ANSWERS = ['Y', 'N', 'A']
const YES_NO_ANSWERS = ['Y', 'N']
const ECHO_DELIMITER = /[\s.,:;=+/([\]]/
const ATTRIB_FLAG = /^([+-])([RH])$/i
const RENAME_INVALID_NAME = /[\\/:]/
const DRIVE_ROOT_LENGTH = 3

const parentDosPath = (path) => {
  const index = path.lastIndexOf('\\')
  const parentLength = index === DRIVE_ROOT_LENGTH - 1 ? DRIVE_ROOT_LENGTH : index
  return { parent: path.slice(0, parentLength), name: path.slice(index + 1) }
}

const errorCode = (error) =>
  error?.data?.data?.code || error?.data?.statusMessage || (error?.statusCode === PAYLOAD_TOO_LARGE ? 'TOO_LARGE' : '')

const formatClock = (epochMs) => {
  const d = new Date(epochMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * State and command interpreter for the MS-DOS Prompt window. Read
 * commands go to `/api/fs/*`; LOGIN/LOGOUT use `/api/auth/*`. Every
 * user-visible string comes from `content/dos.json`.
 *
 * @param {{ onExit: () => void, pickFiles: (options: { multiple: boolean, accept: string }) => Promise<File[]> }} options
 *   `onExit` is called by EXIT; `pickFiles` opens the browser file picker
 *   for drive A: and must call `input.click()` synchronously.
 * @returns {{
 *   lines: import('vue').Ref<Array<{ id: number, text: string, cls: string }>>,
 *   prompt: import('vue').ComputedRef<string>,
 *   mode: import('vue').Ref<'command'|'password'|'confirm'|'input'|'edit'|'busy'>,
 *   admin: import('vue').Ref<boolean>,
 *   expiresAt: import('vue').Ref<number|null>,
 *   editor: import('vue').Ref<{ path: string, name: string, content: string, readonly: boolean }|null>,
 *   init: () => Promise<void>,
 *   submit: (input: string) => Promise<void>,
 *   recall: (direction: -1|1) => string|null,
 *   expireSession: () => void,
 *   interrupt: () => boolean,
 *   saveEditor: (content: string) => Promise<{ ok: boolean, message: string }>,
 *   closeEditor: () => Promise<void>,
 * }}
 * @example
 *   const shell = useDosShell({ onExit: closeWindow })
 *   await shell.init()
 *   await shell.submit('dir /a')
 */
export const useDosShell = ({ onExit, pickFiles }) => {
  const refreshContent = useContentRefresh()
  const lines = ref([])
  const cwd = ref(dos.homePath)
  const admin = ref(false)
  const expiresAt = ref(null)
  const mode = ref('command')
  const history = []
  let historyIndex = 0
  let nextLineId = 1
  const question = ref('')
  let answerQuestion = null
  let allowedAnswers = CONFIRM_ANSWERS
  const editor = ref(null)
  let editSession = null
  let copyCon = null

  const prompt = computed(() => {
    if (mode.value === 'confirm') return question.value
    if (mode.value === 'input') return ''
    return `${admin.value ? dos.adminPromptPrefix : ''}${cwd.value}>`
  })

  const print = (text = '', cls = '') => {
    String(text)
      .split('\n')
      .forEach((line) => lines.value.push({ id: nextLineId++, text: line, cls }))
  }
  const printError = (text) => print(text, 'err')
  const message = (key, values) => fillTemplate(dos.messages[key], values)

  const resolveArg = (arg) => {
    const resolved = resolveDosPath(cwd.value, arg)
    if ('error' in resolved) {
      printError(message(resolved.error, { drive: resolved.drive }))
      return null
    }
    return resolved.path
  }

  const assertSwitches = (switches, allowed) => {
    const invalid = switches.find((s) => !allowed.includes(s))
    if (invalid) {
      printError(message('invalidSwitch', { switch: `/${invalid}` }))
      return false
    }
    return true
  }

  const requireArgCount = (args, count) => {
    if (args.length < count) {
      printError(message('requiredParameter'))
      return false
    }
    if (args.length > count) {
      printError(message('tooManyParameters', { param: args[count] }))
      return false
    }
    return true
  }

  const ask = (text, answers = CONFIRM_ANSWERS) =>
    new Promise((resolve) => {
      question.value = text
      allowedAnswers = answers
      answerQuestion = resolve
      mode.value = 'confirm'
    })

  const printWarnings = (result) => {
    ;(result?.warnings || []).forEach((text) => print(message('contentWarning', { text }), 'warn'))
  }

  const requireAdminSession = () => {
    if (admin.value) return true
    printError(message('adminRequired'))
    return false
  }

  /**
   * Drops admin mode locally when the session expires (timer or a 401
   * from a write).
   *
   * @returns {void}
   */
  const expireSession = () => {
    if (!admin.value) return
    admin.value = false
    expiresAt.value = null
    print(message('sessionExpired'), 'warn')
  }

  const fsErrorText = (code, name) => {
    if (code === 'NOT_FOUND') return message('fileNotFound', { name })
    if (code === 'NOT_A_DIR') return message('invalidDirectory')
    if (['IS_A_DIR', 'READ_ONLY', 'PROTECTED'].includes(code)) return message('accessDenied')
    if (code === 'INVALID_PATH' || code === 'INVALID_NAME') return message('invalidPath')
    if (code === 'TOO_LARGE') return message('fileTooLarge', { name })
    if (code === 'UNSUPPORTED_TYPE') return message('unsupportedType', { name })
    if (code === 'INVALID_MOVE') return message('copyOntoItself')
    if (code === 'EXISTS') return message('duplicateFileName')
    if (code === 'UNAUTHORIZED') return message('adminRequired')
    return message('generalFailure')
  }

  const reportFsError = (error, name) => {
    const code = errorCode(error)
    if (code === 'UNAUTHORIZED') expireSession()
    else printError(fsErrorText(code, name))
  }

  const post = async (url, body) => {
    try {
      return { data: await $fetch(url, { method: 'POST', body }) }
    } catch (error) {
      return { error, code: errorCode(error) }
    }
  }

  /**
   * Sends one admin write request and prints its outcome the DOS way:
   * nothing on success except content warnings, plus the F5 hint when the
   * server reports that the site content changed.
   *
   * @param {string} url
   * @param {object} body
   * @param {string} name Argument as typed, used in error messages.
   * @param {Record<string, string>} [errorMessages] Error code → dos.json message key overrides.
   * @returns {Promise<object|null>} Response data, or null on error.
   */
  const runWrite = async (url, body, name, errorMessages = {}) => reportWrite(await post(url, body), name, errorMessages)

  /**
   * Prints the outcome of a finished write request (see runWrite).
   *
   * @param {{ data?: object, error?: unknown, code?: string }} result
   * @param {string} name
   * @param {Record<string, string>} [errorMessages]
   * @returns {Promise<object|null>}
   */
  const reportWrite = async (result, name, errorMessages = {}) => {
    if (result.error) {
      const key = errorMessages[result.code]
      if (key) printError(message(key, { name }))
      else reportFsError(result.error, name)
      return null
    }
    printWarnings(result.data)
    await printRefreshHint(result.data?.siteChanged)
    return result.data
  }

  const showAttributes = async (path, typed) => {
    const target = path ? parentDosPath(path) : { parent: cwd.value, name: '' }
    try {
      const listing = await $fetch('/api/fs/list', { query: { path: target.parent } })
      const entries = listing.entries.filter((e) =>
        target.name && !hasWildcard(target.name)
          ? e.name.toUpperCase() === target.name.toUpperCase()
          : e.type === 'file' && matchesWildcard(e.name, target.name || '*'),
      )
      if (!entries.length) {
        printError(message('fileNotFound', { name: typed || '*.*' }))
        return
      }
      entries.forEach((e) => print(formatAttribLine(e, joinDosPath(listing.path, e.name))))
    } catch (error) {
      reportFsError(error, typed)
    }
  }

  /**
   * After a write that changed the site: reloads the content so the
   * desktop and open windows update in place, then tells the admin.
   *
   * @param {boolean} siteChanged
   * @returns {Promise<void>}
   */
  const printRefreshHint = async (siteChanged) => {
    if (!siteChanged) return
    const refreshed = await refreshContent()
    print(message(refreshed ? 'siteUpdated' : 'refreshHint'), 'dim')
  }

  /**
   * Lists the files in a directory that match the wildcard in the last
   * segment of `path` (hidden files only when asked, as DOS DEL/COPY skip
   * them). Prints "File not found" when nothing matches.
   *
   * @param {string} path Resolved path whose last segment is the pattern.
   * @param {string} typed Argument as typed, for messages.
   * @param {{ includeHidden?: boolean }} [options]
   * @returns {Promise<Array<{ name: string, path: string, hidden: boolean, readonly: boolean }>>}
   */
  const expandFiles = async (path, typed, { includeHidden = false } = {}) => {
    const { parent, name } = parentDosPath(path)
    try {
      const listing = await $fetch('/api/fs/list', { query: { path: parent } })
      const files = listing.entries
        .filter((e) => e.type === 'file' && (includeHidden || !e.hidden) && matchesWildcard(e.name, name))
        .map((e) => ({ ...e, path: joinDosPath(listing.path, e.name) }))
      if (!files.length) printError(message('fileNotFound', { name: typed }))
      return files
    } catch (error) {
      reportFsError(error, typed)
      return []
    }
  }

  const entryType = async (path) => {
    try {
      await $fetch('/api/fs/list', { query: { path } })
      return 'dir'
    } catch (error) {
      return errorCode(error) === 'NOT_A_DIR' ? 'file' : null
    }
  }

  /**
   * Runs one write request per file and reports errors per file; stops
   * when the session has expired.
   *
   * @param {Array<{ name: string }>} files
   * @param {(file: object) => Promise<{ data?: object, error?: unknown, code?: string, skipped?: boolean }>} request
   * @param {(file: object, data: object) => void} [onSuccess]
   * @returns {Promise<{ done: number, siteChanged: boolean }>}
   */
  const runBatch = async (files, request, onSuccess) => {
    let done = 0
    let siteChanged = false
    for (const file of files) {
      const result = await request(file)
      if (result.skipped) continue
      if (result.error) {
        reportFsError(result.error, file.name)
        if (result.code === 'UNAUTHORIZED') break
        continue
      }
      done++
      siteChanged ||= Boolean(result.data?.siteChanged)
      printWarnings(result.data)
      if (onSuccess) onSuccess(file, result.data)
    }
    return { done, siteChanged }
  }

  const uploadFile = (file, path, overwrite) => {
    const form = new FormData()
    form.append('path', path)
    form.append('overwrite', overwrite ? '1' : '0')
    form.append('file', file, file.name)
    return post('/api/fs/upload', form)
  }

  const withOverwritePrompt = async (name, run, state) => {
    const first = await run(state.all)
    if (first.code !== 'EXISTS') return first
    const target = first.error?.data?.data?.path || name
    const answer = await ask(message('overwritePrompt', { name: target }))
    if (answer === 'A') state.all = true
    if (answer === 'N') return { skipped: true }
    return run(true)
  }

  const copyFromFloppy = async (source, destination, overwriteAll) => {
    const pattern = source.slice(2).replace(/^[\\/]/, '')
    const extension = pattern.match(/\.([a-z0-9]+)$/i)?.[1]
    const accept = extension && !/[*?]/.test(extension) ? `.${extension.toLowerCase()}` : dos.floppyAccept
    const destPath = resolveArg(destination || '.')
    if (!destPath) return

    print(message('insertDiskette'))
    const files = await pickFiles({ multiple: !pattern || /[*?]/.test(pattern), accept })
    if (!files.length) {
      printError(message('driveNotReady', { drive: 'A' }))
      return
    }

    const state = { all: overwriteAll }
    let copied = 0
    let siteChanged = false
    for (const file of files) {
      print(`A:\\${file.name}`)
      const result = await withOverwritePrompt(file.name, (overwrite) => uploadFile(file, destPath, overwrite), state)
      if (result.skipped) continue
      if (result.error) {
        reportFsError(result.error, file.name)
        if (result.code === 'UNAUTHORIZED') break
        continue
      }
      copied++
      siteChanged ||= Boolean(result.data?.siteChanged)
      printWarnings(result.data)
    }
    print(`${SUMMARY_INDENT}${message('filesCopied', { count: copied })}`)
    await printRefreshHint(siteChanged)
  }

  /**
   * COPY or MOVE every file matching a wildcard into a directory, asking
   * before each overwrite (Yes/No/All). Prints each source name like DOS.
   *
   * @param {'copy'|'move'} action
   * @param {string} from Resolved source path with a wildcard in its last segment.
   * @param {string} typed Source argument as typed.
   * @param {string} to Resolved destination.
   * @param {boolean} overwriteAll /Y switch.
   * @returns {Promise<{ done: number, siteChanged: boolean }>}
   */
  const copyOrMoveMatches = async (action, from, typed, to, overwriteAll) => {
    const files = await expandFiles(from, typed)
    if (!files.length) return { done: 0, siteChanged: false }
    if (files.length > 1 && (await entryType(to)) !== 'dir') {
      printError(message(action === 'copy' ? 'copyMultipleToFile' : 'moveMultipleToFile'))
      return { done: 0, siteChanged: false }
    }
    const state = { all: overwriteAll }
    return runBatch(
      files,
      (file) => {
        if (action === 'copy') print(file.name)
        return withOverwritePrompt(
          file.name,
          (overwrite) => post(`/api/fs/${action}`, { from: file.path, to, overwrite }),
          state,
        )
      },
      (_file, data) => {
        if (action === 'move') reportMoved(data)
      },
    )
  }

  const reportMoved = (data) => {
    print(message('moveOk', { from: data.from, to: data.path }))
    if (isSameOrInside(cwd.value, data.from)) cwd.value = `${data.path}${cwd.value.slice(data.from.length)}`
  }

  const copyWithinDrive = async (source, destination, overwriteAll) => {
    const from = resolveArg(source)
    if (!from) return
    const to = resolveArg(destination || '.')
    if (!to) return
    if (hasWildcard(parentDosPath(from).name)) {
      const { done, siteChanged } = await copyOrMoveMatches('copy', from, source, to, overwriteAll)
      print(`${SUMMARY_INDENT}${message('filesCopied', { count: done })}`)
      await printRefreshHint(siteChanged)
      return
    }
    const name = from.split('\\').pop()
    const result = await withOverwritePrompt(name, (overwrite) => post('/api/fs/copy', { from, to, overwrite }), {
      all: overwriteAll,
    })
    if (result.error) {
      reportFsError(result.error, source)
      print(`${SUMMARY_INDENT}${message('filesCopied', { count: 0 })}`)
      return
    }
    if (!result.skipped) printWarnings(result.data)
    print(`${SUMMARY_INDENT}${message('filesCopied', { count: result.skipped ? 0 : 1 })}`)
    await printRefreshHint(result.data?.siteChanged)
  }

  const startCopyCon = (destination, overwriteAll) => {
    if (!destination) {
      printError(message('requiredParameter'))
      return
    }
    const path = resolveArg(destination)
    if (!path) return
    copyCon = { path, name: destination, overwriteAll, typed: [] }
    mode.value = 'input'
  }

  const finishCopyCon = async (tail) => {
    const { path, name, overwriteAll, typed } = copyCon
    copyCon = null
    const content = `${typed.map((line) => `${line}\n`).join('')}${tail}`
    const result = await withOverwritePrompt(
      name,
      (overwrite) => post('/api/fs/write', { path, content, mode: overwrite ? 'overwrite' : 'create' }),
      { all: overwriteAll },
    )
    if (result.error) reportFsError(result.error, name)
    else if (!result.skipped) printWarnings(result.data)
    const copied = !result.error && !result.skipped
    print(`${SUMMARY_INDENT}${message('filesCopied', { count: copied ? 1 : 0 })}`)
    await printRefreshHint(copied && result.data?.siteChanged)
  }

  const commands = {
    async ATTRIB({ args, switches }) {
      if (!assertSwitches(switches, [])) return
      const flags = args.filter((a) => /^[+-]/.test(a))
      const paths = args.filter((a) => !/^[+-]/.test(a))
      if (paths.length > 1) {
        printError(message('tooManyParameters', { param: paths[1] }))
        return
      }
      const patch = {}
      for (const flag of flags) {
        const match = flag.match(ATTRIB_FLAG)
        if (!match) {
          printError(message('invalidParameter', { param: flag }))
          return
        }
        patch[match[2].toUpperCase() === 'R' ? 'readonly' : 'hidden'] = match[1] === '+'
      }
      const path = paths.length ? resolveArg(paths[0]) : null
      if (paths.length && !path) return
      if (!flags.length) {
        await showAttributes(path, paths[0])
        return
      }
      if (!paths.length) {
        printError(message('requiredParameter'))
        return
      }
      if (!requireAdminSession()) return
      if (hasWildcard(parentDosPath(path).name)) {
        const files = await expandFiles(path, paths[0], { includeHidden: true })
        const { siteChanged } = await runBatch(files, (file) => post('/api/fs/attrib', { path: file.path, ...patch }))
        await printRefreshHint(siteChanged)
        return
      }
      await runWrite('/api/fs/attrib', { path, ...patch }, paths[0])
    },

    async CD({ args }) {
      if (!args.length) {
        print(cwd.value)
        return
      }
      const path = resolveArg(args[0])
      if (!path) return
      try {
        const listing = await $fetch('/api/fs/list', { query: { path } })
        cwd.value = listing.path
      } catch {
        printError(message('invalidDirectory'))
      }
    },

    CLS() {
      lines.value = []
    },

    COPY({ args, switches }) {
      if (!assertSwitches(switches, ['Y'])) return
      if (!args.length) {
        printError(message('requiredParameter'))
        return
      }
      if (!requireAdminSession()) return
      const overwriteAll = switches.includes('Y')
      if (/^con$/i.test(args[0])) return startCopyCon(args[1], overwriteAll)
      // Must stay synchronous up to pickFiles(): the browser only opens the
      // file picker inside the keydown that submitted the command.
      if (/^a:/i.test(args[0])) return copyFromFloppy(args[0], args[1], overwriteAll)
      return copyWithinDrive(args[0], args[1], overwriteAll)
    },

    async DIR({ args, switches }) {
      if (!assertSwitches(switches, ['A'])) return
      const path = resolveArg(args[0] || '.')
      if (!path) return
      const options = {
        showHidden: switches.includes('A'),
        labels: dos.dir,
        volumeLabel: dos.volumeLabel,
        volumeSerial: dos.volumeSerial,
      }
      const { parent, name } = parentDosPath(path)
      try {
        if (!hasWildcard(name)) {
          try {
            const listing = await $fetch('/api/fs/list', { query: { path } })
            formatDirListing(listing, options).forEach((line) => print(line))
            return
          } catch (error) {
            if (errorCode(error) !== 'NOT_A_DIR') throw error
          }
        }
        const listing = await $fetch('/api/fs/list', { query: { path: parent } })
        const entries = listing.entries.filter((e) => (options.showHidden || !e.hidden) && matchesWildcard(e.name, name))
        if (!entries.length) {
          printError(message('fileNotFound', { name: args[0] }))
          return
        }
        formatDirListing({ ...listing, entries }, { ...options, hideDots: true }).forEach((line) => print(line))
      } catch (error) {
        reportFsError(error, args[0] || path)
      }
    },

    async DEL({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      let pattern = path
      if (!hasWildcard(parentDosPath(path).name)) {
        const result = await post('/api/fs/delete', { path, type: 'file' })
        if (result.code !== 'IS_A_DIR') {
          await reportWrite(result, args[0])
          return
        }
        pattern = joinDosPath(path, '*.*')
      }
      if (['*', '*.*'].includes(parentDosPath(pattern).name)) {
        if ((await ask(message('deleteAllPrompt'), YES_NO_ANSWERS)) !== 'Y') return
      }
      const files = await expandFiles(pattern, args[0])
      const { siteChanged } = await runBatch(files, (file) => post('/api/fs/delete', { path: file.path, type: 'file' }))
      await printRefreshHint(siteChanged)
    },

    async DELTREE({ args, switches }) {
      if (!assertSwitches(switches, ['Y']) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      if (isSameOrInside(cwd.value, path)) {
        printError(message('removeCurrentDir', { name: args[0] }))
        return
      }
      const type = await entryType(path)
      if (!type) {
        printError(message('fileNotFound', { name: args[0] }))
        return
      }
      if (!switches.includes('Y')) {
        const promptKey = type === 'dir' ? 'deltreeDirPrompt' : 'deltreeFilePrompt'
        if ((await ask(message(promptKey, { name: args[0] }), YES_NO_ANSWERS)) !== 'Y') return
      }
      const result = await post('/api/fs/delete', { path, recursive: true })
      if (!result.error) print(message('deleting', { name: args[0] }))
      await reportWrite(result, args[0])
    },

    async ECHO({ rest }) {
      const { text, target, append } = splitRedirect(rest)
      const output = !text.trim() && !text.startsWith('.')
        ? message('echoOn')
        : ECHO_DELIMITER.test(text.charAt(0)) ? text.slice(1) : text
      if (target === null) {
        print(output)
        return
      }
      if (!target) {
        printError(message('syntaxError'))
        return
      }
      if (!requireAdminSession()) return
      const path = resolveArg(target)
      if (!path) return
      await runWrite(
        '/api/fs/write',
        { path, content: `${output}\n`, mode: append ? 'append' : 'overwrite' },
        target,
        { NOT_FOUND: 'invalidPath' },
      )
    },

    async EDIT({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      let file = null
      try {
        file = await $fetch('/api/fs/read', { query: { path } })
      } catch (error) {
        if (errorCode(error) !== 'NOT_FOUND') {
          reportFsError(error, args[0])
          return
        }
      }
      if (file?.binary) {
        printError(message('binaryFile', { name: file.name, size: file.size.toLocaleString('en-US') }))
        return
      }
      const canonical = file?.path || path
      editSession = { saved: false, siteChanged: false, warnings: [] }
      editor.value = {
        path: canonical,
        name: canonical.split('\\').pop(),
        content: file?.content || '',
        readonly: Boolean(file?.readonly),
      }
      mode.value = 'edit'
    },

    EXIT() {
      onExit()
    },

    HELP() {
      const width = Math.max(...dos.help.map((h) => h.command.length)) + 2
      dos.help.forEach((h) => print(`${h.command.padEnd(width)}${h.text}`))
    },

    LOGIN() {
      if (admin.value) {
        print(message('alreadyLoggedIn', { time: formatClock(expiresAt.value) }))
        return
      }
      mode.value = 'password'
    },

    async LOGOUT() {
      if (!admin.value) {
        print(message('notLoggedIn'))
        return
      }
      await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
      admin.value = false
      expiresAt.value = null
      print(message('loggedOut'))
    },

    async MD({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      await runWrite('/api/fs/mkdir', { path }, args[0], {
        EXISTS: 'unableToCreateDir',
        NOT_FOUND: 'unableToCreateDir',
        NOT_A_DIR: 'unableToCreateDir',
        INVALID_NAME: 'unableToCreateDir',
      })
    },

    async MOVE({ args, switches }) {
      if (!assertSwitches(switches, ['Y']) || !requireArgCount(args, 2) || !requireAdminSession()) return
      const from = resolveArg(args[0])
      if (!from) return
      const to = resolveArg(args[1])
      if (!to) return
      const overwriteAll = switches.includes('Y')
      if (hasWildcard(parentDosPath(from).name)) {
        const { siteChanged } = await copyOrMoveMatches('move', from, args[0], to, overwriteAll)
        await printRefreshHint(siteChanged)
        return
      }
      const result = await withOverwritePrompt(args[0], (overwrite) => post('/api/fs/move', { from, to, overwrite }), {
        all: overwriteAll,
      })
      if (result.skipped) return
      if (result.error) {
        reportFsError(result.error, args[0])
        return
      }
      printWarnings(result.data)
      reportMoved(result.data)
      await printRefreshHint(result.data?.siteChanged)
    },

    async RD({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      if (isSameOrInside(cwd.value, path)) {
        printError(message('removeCurrentDir', { name: args[0] }))
        return
      }
      await runWrite('/api/fs/delete', { path, type: 'dir' }, args[0], {
        NOT_FOUND: 'rdFailed',
        NOT_A_DIR: 'rdFailed',
        NOT_EMPTY: 'rdFailed',
      })
    },

    async REN({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 2) || !requireAdminSession()) return
      const [source, newName] = args
      if (RENAME_INVALID_NAME.test(newName)) {
        printError(message('invalidParameter', { param: newName }))
        return
      }
      const path = resolveArg(source)
      if (!path) return
      if (hasWildcard(parentDosPath(path).name) || hasWildcard(newName)) {
        const files = (await expandFiles(path, source)).filter((f) => applyRenamePattern(f.name, newName) !== f.name)
        const { siteChanged } = await runBatch(files, (file) =>
          post('/api/fs/rename', { path: file.path, newName: applyRenamePattern(file.name, newName) }),
        )
        await printRefreshHint(siteChanged)
        return
      }
      const result = await runWrite('/api/fs/rename', { path, newName }, source, {
        EXISTS: 'duplicateFileName',
        NOT_FOUND: 'duplicateFileName',
      })
      if (result && isSameOrInside(cwd.value, path)) cwd.value = `${result.path}${cwd.value.slice(path.length)}`
    },

    async TREE({ args, switches }) {
      if (!assertSwitches(switches, ['F', 'A'])) return
      const path = resolveArg(args[0] || '.')
      if (!path) return
      const includeFiles = switches.includes('F')
      try {
        const tree = await $fetch('/api/fs/tree', { query: { path, files: includeFiles ? '1' : '0' } })
        formatTree(tree, {
          includeFiles,
          labels: dos.tree,
          volumeLabel: dos.volumeLabel,
          volumeSerial: dos.volumeSerial,
        }).forEach((line) => print(line))
      } catch (error) {
        reportFsError(error, args[0] || path)
      }
    },

    async TYPE({ args }) {
      if (!args.length) {
        printError(message('requiredParameter'))
        return
      }
      if (args.length > 1) {
        printError(message('tooManyParameters', { param: args[1] }))
        return
      }
      const path = resolveArg(args[0])
      if (!path) return
      try {
        const file = await $fetch('/api/fs/read', { query: { path } })
        if (file.binary) print(message('binaryFile', { name: file.name, size: file.size.toLocaleString('en-US') }))
        else print(file.content)
      } catch (error) {
        reportFsError(error, args[0])
      }
    },

    VER() {
      print('')
      print(dos.version)
      print('')
    },
  }
  Object.assign(commands, { MKDIR: commands.MD, RMDIR: commands.RD, ERASE: commands.DEL, RENAME: commands.REN })

  const login = async (password) => {
    try {
      const result = await $fetch('/api/auth/login', { method: 'POST', body: { password } })
      admin.value = true
      expiresAt.value = result.expiresAt
      print(message('loginOk', { time: formatClock(result.expiresAt) }), 'ok')
    } catch (error) {
      const code = errorCode(error)
      if (code === 'TOO_MANY_ATTEMPTS') printError(message('tooManyAttempts'))
      else if (code === 'AUTH_NOT_CONFIGURED') printError(message('authNotConfigured'))
      else if (code === 'INVALID_PASSWORD') printError(message('loginFailed'))
      else printError(message('generalFailure'))
    }
  }

  /**
   * Executes one line typed at the prompt (or the password while the
   * LOGIN prompt is active).
   *
   * @param {string} input
   * @returns {Promise<void>}
   */
  const submit = async (input) => {
    if (mode.value === 'busy') return

    if (mode.value === 'confirm') {
      print(`${question.value}${input}`)
      const answer = input.trim().charAt(0).toUpperCase()
      if (!allowedAnswers.includes(answer)) return
      mode.value = 'busy'
      const resolve = answerQuestion
      answerQuestion = null
      resolve(answer)
      return
    }

    if (mode.value === 'input') {
      print(input.split(DOS_EOF_CHAR).join('^Z'))
      const eof = input.indexOf(DOS_EOF_CHAR)
      if (eof === -1) {
        copyCon.typed.push(input)
        return
      }
      mode.value = 'busy'
      await finishCopyCon(input.slice(0, eof))
      if (mode.value === 'busy') mode.value = 'command'
      print('')
      return
    }

    if (mode.value === 'password') {
      print(`${dos.messages.passwordPrompt}${'*'.repeat(input.length)}`)
      mode.value = 'busy'
      await login(input)
      mode.value = 'command'
      print('')
      return
    }

    print(`${prompt.value}${input}`)
    const trimmed = input.trim()
    if (!trimmed) return
    if (history[history.length - 1] !== trimmed) history.push(trimmed)
    if (history.length > DOS_HISTORY_MAX) history.shift()
    historyIndex = history.length

    if (/^[a-z]:$/i.test(trimmed)) {
      const resolved = resolveDosPath(cwd.value, trimmed)
      if ('error' in resolved) printError(message(resolved.error, { drive: resolved.drive }))
      print('')
      return
    }

    const parsed = parseCommandLine(trimmed)
    const handler = commands[parsed.command]
    mode.value = 'busy'
    try {
      if (handler) await handler(parsed)
      else printError(message('badCommand'))
    } finally {
      if (mode.value === 'busy') mode.value = 'command'
    }
    if (parsed.command !== 'CLS' && mode.value === 'command') print('')
  }

  /**
   * Ctrl+C: abandons COPY CON input without writing anything.
   *
   * @returns {boolean} Whether there was input to interrupt.
   */
  const interrupt = () => {
    if (mode.value !== 'input') return false
    copyCon = null
    print('^C')
    print('')
    mode.value = 'command'
    return true
  }

  /**
   * Saves the EDIT buffer to the open file.
   *
   * @param {string} content
   * @returns {Promise<{ ok: boolean, message: string }>} `message` is a
   *   content warning or error text for the editor status bar, or '' on a clean save.
   * @throws {Error} When no file is open in the editor.
   * @example
   *   const { ok, message } = await shell.saveEditor(text)
   */
  const saveEditor = async (content) => {
    if (!editor.value || !editSession) throw new Error('saveEditor called without an open editor')
    const result = await post('/api/fs/write', { path: editor.value.path, content, mode: 'overwrite' })
    if (result.error) {
      if (result.code === 'UNAUTHORIZED') expireSession()
      return { ok: false, message: fsErrorText(result.code, editor.value.name) }
    }
    editSession.saved = true
    editSession.siteChanged ||= Boolean(result.data?.siteChanged)
    editSession.warnings = result.data?.warnings || []
    const [warning] = editSession.warnings
    return { ok: true, message: warning ? message('contentWarning', { text: warning }) : '' }
  }

  /**
   * Leaves EDIT and returns to the prompt, reporting what the saves did.
   *
   * @returns {Promise<void>}
   */
  const closeEditor = async () => {
    if (!editor.value) return
    const session = editSession
    mode.value = 'busy'
    editor.value = null
    editSession = null
    if (session?.saved) {
      session.warnings.forEach((text) => print(message('contentWarning', { text }), 'warn'))
      await printRefreshHint(session.siteChanged)
    }
    print('')
    mode.value = 'command'
  }

  /**
   * Steps through command history like DOSKEY.
   *
   * @param {-1|1} direction -1 for ↑ (older), 1 for ↓ (newer).
   * @returns {string|null} The recalled command, or null when unchanged.
   */
  const recall = (direction) => {
    if (!history.length || mode.value !== 'command') return null
    historyIndex = Math.min(history.length, Math.max(0, historyIndex + direction))
    return history[historyIndex] ?? ''
  }

  /**
   * Prints the banner and restores an existing admin session.
   *
   * @returns {Promise<void>}
   */
  const init = async () => {
    dos.banner.forEach((line) => print(line))
    const me = await $fetch('/api/auth/me').catch(() => null)
    if (me?.admin) {
      admin.value = true
      expiresAt.value = me.expiresAt
    }
  }

  return {
    lines,
    prompt,
    mode,
    admin,
    expiresAt,
    editor,
    init,
    submit,
    recall,
    expireSession,
    interrupt,
    saveEditor,
    closeEditor,
  }
}
