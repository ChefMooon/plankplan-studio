import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  })),
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
})

Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
