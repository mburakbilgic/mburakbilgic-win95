// Prints an scrypt hash for NUXT_ADMIN_PASSWORD_HASH.
// The format must stay in sync with verifyPassword() in server/utils/auth.ts.
//
//   npm run admin:hash              → prompts twice, input hidden
//   echo "pw" | npm run admin:hash  → reads the password from stdin (CI/automation)
import { randomBytes, scryptSync } from 'node:crypto'
import { createInterface } from 'node:readline'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16
const MIN_PASSWORD_LENGTH = 12

const askHidden = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl.stdoutMuted = false
    rl._writeToOutput = (text) => {
      if (!rl.stdoutMuted || text.includes(question)) process.stdout.write(text)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    rl.stdoutMuted = true
  })

const readStdin = async () => {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data.replace(/\r?\n$/, '')
}

const password = process.stdin.isTTY ? await askHidden('Admin password: ') : await readStdin()
if (process.stdin.isTTY) {
  const again = await askHidden('Repeat password: ')
  if (again !== password) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  process.exit(1)
}

const salt = randomBytes(SALT_BYTES)
const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
const encoded = ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), hash.toString('base64')].join('$')

console.log(`\nAdd this line to .env (local) and to the VPS .env:\n\nNUXT_ADMIN_PASSWORD_HASH=${encoded}\n`)
