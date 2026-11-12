import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY, type Theme } from '@/components/theme-context'

export interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readTheme(storage: ThemeStorage): Theme {
  let current: string | null
  try {
    current = storage.getItem(THEME_STORAGE_KEY)
  } catch {
    return 'system'
  }
  if (isTheme(current)) return current

  let legacy: string | null
  try {
    legacy = storage.getItem(LEGACY_THEME_STORAGE_KEY)
  } catch {
    return 'system'
  }
  if (!isTheme(legacy)) return 'system'

  try {
    storage.setItem(THEME_STORAGE_KEY, legacy)
  } catch {
    return legacy
  }
  try {
    storage.removeItem(LEGACY_THEME_STORAGE_KEY)
  } catch {
    // The replacement is saved; a stale legacy key is harmless.
  }
  return legacy
}
