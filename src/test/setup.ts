import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
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
Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false })
Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
Object.defineProperty(Element.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})
