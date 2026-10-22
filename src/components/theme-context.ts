import { createContext, useContext } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'web-static-template-theme'

export const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
} | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
