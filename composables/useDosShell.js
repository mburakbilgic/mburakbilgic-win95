import { computed, ref } from 'vue'
import dos from '@/content/dos.json'
import { DOS_HISTORY_MAX } from '@/constants/ui'
import { fillTemplate, formatDirListing, formatTree, parseCommandLine, resolveDosPath } from '@/composables/dosFormat'

const errorCode = (error) => error?.data?.data?.code || error?.data?.statusMessage || ''

const formatClock = (epochMs) => {
  const d = new Date(epochMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * State and command interpreter for the MS-DOS Prompt window. Read
 * commands go to `/api/fs/*`; LOGIN/LOGOUT use `/api/auth/*`. Every
 * user-visible string comes from `content/dos.json`.
 *
 * @param {{ onExit: () => void }} options Called by the EXIT command.
 * @returns {{
 *   lines: import('vue').Ref<Array<{ id: number, text: string, cls: string }>>,
 *   prompt: import('vue').ComputedRef<string>,
 *   mode: import('vue').Ref<'command'|'password'|'busy'>,
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
export const useDosShell = ({ onExit }) => {
  const lines = ref([])
  const cwd = ref(dos.homePath)
  const admin = ref(false)
  const expiresAt = ref(null)
  const mode = ref('command')
  const history = []
  let historyIndex = 0
  let nextLineId = 1

  const prompt = computed(() => `${admin.value ? dos.adminPromptPrefix : ''}${cwd.value}>`)

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

  const reportFsError = (error, name) => {
    const code = errorCode(error)
    if (code === 'NOT_FOUND') printError(message('fileNotFound', { name }))
    else if (code === 'NOT_A_DIR') printError(message('invalidDirectory'))
    else if (code === 'IS_A_DIR') printError(message('accessDenied'))
    else if (code === 'INVALID_PATH') printError(message('invalidPath'))
    else printError(message('generalFailure'))
  }

  const commands = {
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
        print(file.content)
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
   * Drops admin mode locally when the session's expiry time passes.
   *
   * @returns {void}
   */
  const expireSession = () => {
    if (!admin.value) return
    admin.value = false
    expiresAt.value = null
    print(message('sessionExpired'), 'warn')
    print('')
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
