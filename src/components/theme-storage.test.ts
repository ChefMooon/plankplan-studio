import { describe, expect, it } from 'vitest'
import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY } from '@/components/theme-context'
import { readTheme, type ThemeStorage } from '@/components/theme-storage'

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { values: Record<string, string> } {
  const values = { ...initial }
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = value },
    removeItem: (key) => { delete values[key] },
  }
}

describe('readTheme', () => {
  it('prefers a valid new choice over a legacy choice', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'dark', [LEGACY_THEME_STORAGE_KEY]: 'light' })
    expect(readTheme(storage)).toBe('dark')
    expect(storage.values[LEGACY_THEME_STORAGE_KEY]).toBe('light')
  })

  it('migrates a valid legacy choice and removes it after saving', () => {
    const storage = memoryStorage({ [LEGACY_THEME_STORAGE_KEY]: 'light' })
    expect(readTheme(storage)).toBe('light')
    expect(storage.values[THEME_STORAGE_KEY]).toBe('light')
    expect(storage.values[LEGACY_THEME_STORAGE_KEY]).toBeUndefined()
  })

  it('keeps a legacy choice in memory when saving its replacement fails', () => {
    const storage = memoryStorage({ [LEGACY_THEME_STORAGE_KEY]: 'dark' })
    storage.setItem = () => { throw new Error('storage full') }
    expect(readTheme(storage)).toBe('dark')
    expect(storage.values[LEGACY_THEME_STORAGE_KEY]).toBe('dark')
  })

  it('falls back to system when storage cannot be read', () => {
    const storage = memoryStorage()
    storage.getItem = () => { throw new Error('storage disabled') }
    expect(readTheme(storage)).toBe('system')
  })

  it('uses system for invalid stored values', () => {
    expect(readTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia', [LEGACY_THEME_STORAGE_KEY]: 'invalid' }))).toBe('system')
  })
})
