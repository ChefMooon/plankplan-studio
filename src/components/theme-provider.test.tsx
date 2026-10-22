import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, useTheme } from './theme-context'
import { ThemeProvider } from './theme-provider'

function createMediaQuery(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  return {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    emit(nextMatches: boolean) {
      this.matches = nextMatches
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent))
    },
  }
}

function ThemeState() {
  const { theme, resolvedTheme } = useTheme()
  return <output aria-label="theme state">{`${theme}/${resolvedTheme}`}</output>
}

describe('ThemeProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses and persists stored preference, then syncs the document', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeProvider><ThemeState /></ThemeProvider>)

    expect(screen.getByLabelText('theme state')).toHaveTextContent('dark/dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('resolves system preference and follows changes only while system is selected', () => {
    const media = createMediaQuery(false)
    vi.stubGlobal('matchMedia', vi.fn(() => media))
    function Controls() {
      const { theme, resolvedTheme, setTheme } = useTheme()
      return <><output aria-label="theme state">{`${theme}/${resolvedTheme}`}</output><button onClick={() => setTheme('light')}>Light</button></>
    }

    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByLabelText('theme state')).toHaveTextContent('system/light')
    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    act(() => media.emit(true))
    expect(screen.getByLabelText('theme state')).toHaveTextContent('system/dark')
    expect(document.documentElement).toHaveClass('dark')

    act(() => screen.getByRole('button', { name: 'Light' }).click())
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByLabelText('theme state')).toHaveTextContent('light/light')
    act(() => media.emit(false))
    expect(screen.getByLabelText('theme state')).toHaveTextContent('light/light')
  })

  it('removes the system preference listener on unmount', () => {
    const media = createMediaQuery(true)
    vi.stubGlobal('matchMedia', vi.fn(() => media))
    const { unmount } = render(<ThemeProvider><ThemeState /></ThemeProvider>)
    unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
