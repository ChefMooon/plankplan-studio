import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type Theme,
} from '@/components/theme-context'

function getStoredTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
      return storedTheme
    }
  } catch {
    // Storage is optional; system preference remains the fallback.
  }

  return 'system'
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getResolvedTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.style.colorScheme = resolvedTheme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getResolvedTheme(theme),
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const syncTheme = () => {
      const nextResolvedTheme = getResolvedTheme(theme)
      setResolvedTheme(nextResolvedTheme)
      applyTheme(nextResolvedTheme)
    }

    syncTheme()

    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        syncTheme()
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme)
    setResolvedTheme(getResolvedTheme(nextTheme))
    applyTheme(getResolvedTheme(nextTheme))

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Storage is optional; the current selection still applies in memory.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

