import { Tooltip } from '@/components/ui/tooltip';

/** Shared trigger for the Project Info dialog in both project workspaces. */
export function ProjectInfoButton({ onClick }: { onClick: () => void }) {
  return <Tooltip content="Project Info" side="bottom">
    <button type="button" className="project-info-icon" aria-label="Project Info" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 11v6m-2 0h4"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>
    </button>
  </Tooltip>;
}
