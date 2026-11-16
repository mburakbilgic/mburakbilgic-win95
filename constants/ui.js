/**
 * Large sentinel value used for screen width/height when the actual
 * `#screen` element cannot be measured (SSR or before mount). Any
 * value larger than the real viewport works — the modifier in
 * interact.js clamps before mutation.
 */
export const SCREEN_FALLBACK_SIZE_PX = 9999

/**
 * Minimum allowed width and height (in px) while a window is being
 * resized via interact.js. Windows smaller than this become unusable
 * because their top-bar and content padding collapse.
 */
export const WINDOW_MIN_SIZE_PX = 400

/**
 * Window id of the MS-DOS Prompt (admin shell); shared by the Start menu
 * entry, the EXIT command and `content/windows.json`.
 */
export const DOS_PROMPT_WINDOW_ID = 'DosPromptWindow'

/**
 * How many commands the MS-DOS Prompt remembers for ↑/↓ recall.
 */
export const DOS_HISTORY_MAX = 50

/**
 * End-of-file marker (Ctrl+Z / F6) that ends COPY CON input; shown as ^Z.
 */
export const DOS_EOF_CHAR = '\u001a'
