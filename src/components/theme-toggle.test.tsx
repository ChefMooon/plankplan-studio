import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from './theme-context'
import { ThemeProvider } from './theme-provider'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  it('cycles through system, light, and dark with accessible names and persists each choice', async () => {
    const user = userEvent.setup()
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    let toggle = screen.getByRole('button', { name: 'Theme: System. Switch to Light.' })
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Theme: Light. Switch to Dark.' })).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Theme: Light. Switch to Dark.' }))
    expect(screen.getByRole('button', { name: 'Theme: Dark. Switch to System.' })).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Theme: Dark. Switch to System.' }))
    toggle = screen.getByRole('button', { name: 'Theme: System. Switch to Light.' })
    expect(toggle).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('supports keyboard activation', async () => {
    const user = userEvent.setup()
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Theme: System. Switch to Light.' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Theme: Light. Switch to Dark.' })).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
