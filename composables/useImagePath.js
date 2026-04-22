const iconModules = import.meta.glob('@/assets/win95Icons/*', { eager: true })

/**
 * Resolves a Win95 icon filename (e.g. "msdos.png") to the bundler's
 * public asset URL. Returns an empty string when the filename cannot be
 * matched, so a missing icon renders as a silent broken image rather
 * than throwing during render.
 *
 * @returns {{ iconPath: (filename: string) => string }}
 * @example
 *   const { iconPath } = useImagePath()
 *   iconPath('msdos.png') // → '/assets/win95Icons/msdos.abc123.png'
 */
export const useImagePath = () => ({
  iconPath: (filename) => {
    if (!filename) return ''
    const match = Object.entries(iconModules).find(([p]) => p.endsWith('/' + filename))
    return match ? match[1].default : ''
  },
})
