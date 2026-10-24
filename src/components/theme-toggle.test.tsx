import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from './theme-context'
import { ThemeProvider } from './theme-provider'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  it('selects a theme directly, exposes the active choice, and persists it', async () => {
    const user = userEvent.setup()
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    expect(screen.getByRole('radiogroup', { name: 'Color theme' })).toBeInTheDocument()
    expect(screen.getByText('System theme')).toHaveClass('sr-only')
    await user.hover(screen.getByRole('radio', { name: 'System theme' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('System theme')
    await user.unhover(screen.getByRole('radio', { name: 'System theme' }))
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    await user.click(screen.getByRole('radio', { name: 'Dark theme' }))
    expect(screen.getByRole('radio', { name: 'Dark theme' })).toBeChecked()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('radio', { name: 'Light theme' }))
    expect(screen.getByRole('radio', { name: 'Light theme' })).toBeChecked()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    await user.click(screen.getByRole('radio', { name: 'System theme' }))
    expect(screen.getByRole('radio', { name: 'System theme' })).toBeChecked()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('supports keyboard activation', async () => {
    const user = userEvent.setup()
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    await user.tab()
    expect(screen.getByRole('radio', { name: 'System theme' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('radio', { name: 'System theme' })).toBeChecked()
    await user.keyboard('{ArrowRight>}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Light theme' })).toBeChecked())
    await user.keyboard('{/ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Light theme' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Light theme' })).toBeChecked()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
