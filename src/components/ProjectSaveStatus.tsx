import { Check } from '@phosphor-icons/react'

const successfulStatuses = new Set(['Saved locally', 'Saved'])

export function ProjectSaveStatus({ status }: { status: string }) {
  const isSuccessful = successfulStatuses.has(status)

  return (
    <span className={`local-badge${isSuccessful ? ' compact-save-status' : ''}`} role="status">
      {isSuccessful && <Check className="save-status-icon" aria-hidden="true" weight="bold" />}
      <span className={isSuccessful ? 'save-status-label' : undefined}>{status}</span>
    </span>
  )
}
