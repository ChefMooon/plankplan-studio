import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectSaveStatus } from './ProjectSaveStatus'

describe('ProjectSaveStatus', () => {
  it.each(['Saved locally', 'Saved'])('marks %s for compact display while preserving status text', status => {
    render(<ProjectSaveStatus status={status} />)

    const statusElement = screen.getByRole('status')
    expect(statusElement).toHaveClass('compact-save-status')
    expect(statusElement.querySelector('.save-status-label')).toHaveTextContent(status)
    expect(statusElement.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['Loading project…', 'Saving…', 'Conflict · reload before saving.', 'Not saved · retry after checking storage.'])(
    'keeps %s readable and un-compacted',
    status => {
      render(<ProjectSaveStatus status={status} />)

      const statusElement = screen.getByRole('status')
      expect(statusElement).not.toHaveClass('compact-save-status')
      expect(statusElement).toHaveTextContent(status)
      expect(statusElement.querySelector('svg')).toBeNull()
    },
  )
})
