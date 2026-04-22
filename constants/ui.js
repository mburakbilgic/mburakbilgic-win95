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
