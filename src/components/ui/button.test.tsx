import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('keeps disabled buttons disabled and prevents activation', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button disabled onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })

    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders its child element when asChild is enabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button asChild onClick={onClick}><a href="/about" onClick={(event) => event.preventDefault()}>About</a></Button>)
    const link = screen.getByRole('link', { name: 'About' })

    expect(link).toHaveAttribute('href', '/about')
    expect(link).toHaveAttribute('data-slot', 'button')
    await user.click(link)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
