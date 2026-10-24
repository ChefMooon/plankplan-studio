import { Link } from '@tanstack/react-router';
import { Tooltip } from '@/components/ui/tooltip';

export function ProjectNavigation({ projectId, projectName, active, onProjectInfo }: { projectId: string; projectName: string; active: 'design' | 'cutlist'; onProjectInfo?: () => void }) {
  return <nav className="project-navigation" aria-label="Project navigation">
    <Tooltip content="All projects" side="bottom">
      <Link className="project-navigation-back" to="/" aria-label="All projects">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
      </Link>
    </Tooltip>
    <strong className="project-navigation-title" title={projectName}>{projectName}</strong>
    <div id="design-project-info-action" className="project-navigation-info">{onProjectInfo && <Tooltip content="Project Info" side="bottom"><button type="button" className="project-info-icon" aria-label="Project Info" onClick={onProjectInfo}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8" /><path d="M12 11v6m-2 0h4" /><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg></button></Tooltip>}</div>
    <div className="project-navigation-tabs" role="group" aria-label="Project areas">
      <Link to="/projects/$projectId/design" params={{ projectId }} aria-current={active === 'design' ? 'page' : undefined} className={active === 'design' ? 'active' : ''}>Design</Link>
      <Link to="/projects/$projectId/cutlist" params={{ projectId }} aria-current={active === 'cutlist' ? 'page' : undefined} className={active === 'cutlist' ? 'active' : ''}>Cutlist</Link>
    </div>
  </nav>;
}
