import { computed, ref } from 'vue'
import dos from '@/content/dos.json'
import { DOS_HISTORY_MAX } from '@/constants/ui'
import {
  fillTemplate,
  formatAttribLine,
  formatDirListing,
  formatTree,
  isSameOrInside,
  joinDosPath,
  parseCommandLine,
  resolveDosPath,
  splitRedirect,
} from '@/composables/dosFormat'

const PAYLOAD_TOO_LARGE = 413
const SUMMARY_INDENT = '        '
const CONFIRM_ANSWERS = ['Y', 'N', 'A']
const ECHO_DELIMITER = /[\s.,:;=+/([\]]/
const ATTRIB_FLAG = /^([+-])([RH])$/i
const RENAME_INVALID_NAME = /[\\/:*?]/
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
 *   mode: import('vue').Ref<'command'|'password'|'confirm'|'busy'>,
 *   admin: import('vue').Ref<boolean>,
 *   expiresAt: import('vue').Ref<number|null>,
 *   init: () => Promise<void>,
 *   submit: (input: string) => Promise<void>,
 *   recall: (direction: -1|1) => string|null,
 *   expireSession: () => void,
 * }}
 * @example
 *   const shell = useDosShell({ onExit: closeWindow })
 *   await shell.init()
 *   await shell.submit('dir /a')
 */
export const useDosShell = ({ onExit, pickFiles }) => {
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

  const prompt = computed(() =>
    mode.value === 'confirm' ? question.value : `${admin.value ? dos.adminPromptPrefix : ''}${cwd.value}>`,
  )

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

  const ask = (text) =>
    new Promise((resolve) => {
      question.value = text
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

  const reportFsError = (error, name) => {
    const code = errorCode(error)
    if (code === 'NOT_FOUND') printError(message('fileNotFound', { name }))
    else if (code === 'NOT_A_DIR') printError(message('invalidDirectory'))
    else if (['IS_A_DIR', 'READ_ONLY', 'PROTECTED'].includes(code)) printError(message('accessDenied'))
    else if (code === 'INVALID_PATH' || code === 'INVALID_NAME') printError(message('invalidPath'))
    else if (code === 'TOO_LARGE') printError(message('fileTooLarge', { name }))
    else if (code === 'UNSUPPORTED_TYPE') printError(message('unsupportedType', { name }))
    else if (code === 'INVALID_MOVE') printError(message('copyOntoItself'))
    else if (code === 'UNAUTHORIZED') expireSession()
    else printError(message('generalFailure'))
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
  const runWrite = async (url, body, name, errorMessages = {}) => {
    const result = await post(url, body)
    if (result.error) {
      const key = errorMessages[result.code]
      if (key) printError(message(key, { name }))
      else reportFsError(result.error, name)
      return null
    }
    printWarnings(result.data)
    if (result.data?.siteChanged) print(message('refreshHint'), 'dim')
    return result.data
  }

  const showAttributes = async (path, typed) => {
    const target = path ? parentDosPath(path) : { parent: cwd.value, name: '' }
    try {
      const listing = await $fetch('/api/fs/list', { query: { path: target.parent } })
      const entries = target.name
        ? listing.entries.filter((e) => e.name.toUpperCase() === target.name.toUpperCase())
        : listing.entries.filter((e) => e.type === 'file')
      if (!entries.length) {
        printError(message('fileNotFound', { name: typed || '*.*' }))
        return
      }
      entries.forEach((e) => print(formatAttribLine(e, joinDosPath(listing.path, e.name))))
    } catch (error) {
      reportFsError(error, typed)
    }
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
    if (siteChanged) print(message('refreshHint'), 'dim')
  }

  const copyWithinDrive = async (source, destination, overwriteAll) => {
    const from = resolveArg(source)
    if (!from) return
    const to = resolveArg(destination || '.')
    if (!to) return
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
    if (result.data?.siteChanged) print(message('refreshHint'), 'dim')
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
      // Must stay synchronous up to pickFiles(): the browser only opens the
      // file picker inside the keydown that submitted the command.
      if (/^a:/i.test(args[0])) return copyFromFloppy(args[0], args[1], overwriteAll)
      return copyWithinDrive(args[0], args[1], overwriteAll)
    },

    async DIR({ args, switches }) {
      if (!assertSwitches(switches, ['A'])) return
      const path = resolveArg(args[0] || '.')
      if (!path) return
      try {
        const listing = await $fetch('/api/fs/list', { query: { path } })
        formatDirListing(listing, {
          showHidden: switches.includes('A'),
          labels: dos.dir,
          volumeLabel: dos.volumeLabel,
          volumeSerial: dos.volumeSerial,
        }).forEach((line) => print(line))
      } catch (error) {
        reportFsError(error, args[0] || path)
      }
    },

    async DEL({ args, switches }) {
      if (!assertSwitches(switches, []) || !requireArgCount(args, 1) || !requireAdminSession()) return
      const path = resolveArg(args[0])
      if (!path) return
      await runWrite('/api/fs/delete', { path, type: 'file' }, args[0])
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
      if (!CONFIRM_ANSWERS.includes(answer)) return
      mode.value = 'busy'
      const resolve = answerQuestion
      answerQuestion = null
      resolve(answer)
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
    if (parsed.command !== 'CLS' && mode.value !== 'password') print('')
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

  return { lines, prompt, mode, admin, expiresAt, init, submit, recall, expireSession }
}
